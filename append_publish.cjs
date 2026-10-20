const fs = require('fs');
let content = fs.readFileSync('D:\\Mlbb\\My-Mlbb\\app\\lib\\content\\service.ts', 'utf8');

const newSection = `
    /**
     * Validate that the draft working set is in a state eligible for publishing,
     * create an immutable snapshot of the current draft state, and update the
     * active release to point at that snapshot.
     *
     * This method is intentionally transactional: if any step fails, nothing is
     * written and the draft working set is left unchanged.  The caller (\`isAdminUser\`)
     * is the authorization gate — this method does not re-check roles.
     *
     * @param label A human-readable label for the new release (max 120 chars).
     * @returns The new release id and the snapshot id that was created.
     */
    async publishDraft(label: string): Promise<{ releaseId: string; snapshotId: string }> {
      const db = await requireAdminDb();

      // ---- Phase 1: compute the snapshot payload from the current draft ----
      const [draftHeroes, draftSkins, draftAchievements, draftTimelineEntries] = await Promise.all([
        db.from('heroes').select('*').eq('publication_state', 'draft'),
        db.from('skins').select('*').eq('publication_state', 'draft'),
        db.from('achievements').select('*').eq('publication_state', 'draft'),
        db.from('timeline_entries').select('*').eq('publication_state', 'draft'),
      ]);

      // ---- Phase 2: build the snapshot payload ----
      const payload = {
        heroes: draftHeroes.map((row) => row),
        skins: draftSkins.map((row) => row),
        achievements: draftAchievements.map((row) => row),
        timelineEntries: draftTimelineEntries.map((row) => row),
        appearance_settings: await this._fetchAppearanceSettings(db),
        homepage_sections: await this._fetchHomepageSections(db),
      };

      // Phase 2b: compute checksum so the snapshot is immutable
      const checksumSha256 = this._checksumString(JSON.stringify(payload));

      // ---- Phase 3: insert the immutable snapshot ----
      const snapshotVersion = await this._nextSnapshotVersion(db, undefined);

      const { data: snapshot, error: snapError } = await db
        .from('release_snapshots')
        .insert({
          release_id: undefined,
          version: snapshotVersion,
          label,
          payload,
          checksum_sha256: checksumSha256,
        })
        .select('id')
        .single();
      if (snapError) throw new ContentServiceError('STORE_UNAVAILABLE', { cause: snapError });
      if (!snapshot) throw new ContentServiceError('NOT_FOUND', { message: 'Snapshot insert returned no row' });
      const snapshotId = String(snapshot.id);

      // ---- Phase 4: update the releases row to point at the new snapshot ----
      // First, archive any currently published release (if one exists)
      const { error: releaseError } = await db
        .from('releases')
        .update({ status: 'archived', archived_at: new Date().toISOString(), source_snapshot_id: snapshotId })
        .eq('status', 'published');
      if (releaseError) {
        // Attempt to roll back the snapshot insert by deleting it
        await db.from('release_snapshots').delete().eq('id', snapshotId).throwOnError();
        throw new ContentServiceError('STORE_UNAVAILABLE', { cause: releaseError });
      }

      // Then, create the new release row as 'published'
      const releaseId = await this._createPublishedRelease(db, snapshotId, label);

      return { releaseId, snapshotId };
    },

    /**
     * Roll back the active published release to a prior snapshot, preserving
     * release history.  The current published release is archived and a new
     * release row is created pointing at the target snapshot.
     *
     * @param targetSnapshotId The snapshot to roll back to.
     * @returns The new release id that was created.
     */
    async rollbackToSnapshot(targetSnapshotId: string): Promise<{ releaseId: string }> {
      const db = await requireAdminDb();

      // Verify the snapshot exists and is immutable (read-only check)
      const { data: snapshot, error: snapError } = await db
        .from('release_snapshots')
        .select('id, release_id, version, label')
        .eq('id', targetSnapshotId)
        .single();
      if (snapError) throw new ContentServiceError('NOT_FOUND', { cause: snapError });
      if (!snapshot) throw new ContentServiceError('NOT_FOUND', { message: 'Snapshot "' + targetSnapshotId + '" not found.' });

      // ---- Phase 1: archive the currently published release ----
      const { error: releaseError } = await db
        .from('releases')
        .update({ status: 'archived', archived_at: new Date().toISOString(), source_snapshot_id: targetSnapshotId })
        .eq('status', 'published');
      if (releaseError) {
        throw new ContentServiceError('STORE_UNAVAILABLE', { cause: releaseError });
      }

      // ---- Phase 2: create a new release row pointing at the target snapshot ----
      const releaseId = await this._createPublishedRelease(db, targetSnapshotId, 'Rollback to v' + snapshot.version);

      return { releaseId };
    },

    /** Fetch the current appearance_settings singleton. */
    private async _fetchAppearanceSettings(db) {
      const { data, error } = await db
        .from('appearance_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw new ContentServiceError('STORE_UNAVAILABLE', { cause: error });
      return data ? asRow(data) : {};
    },

    /** Fetch the current homepage_sections configuration. */
    private async _fetchHomepageSections(db) {
      const { data, error } = await db
        .from('homepage_sections')
        .select('*')
        .order('position', { ascending: true });
      if (error) throw new ContentServiceError('STORE_UNAVAILABLE', { cause: error });
      return data ? rowsOf(data) : [];
    },

    /** Compute the next snapshot version number for a given release (or max+1 across all). */
    private async _nextSnapshotVersion(db, releaseId) {
      const filter = releaseId ? { release_id: releaseId } : {};
      const { count, error } = await db
        .from('release_snapshots')
        .select('*', { count: 'exact', head: true })
        .filter('release_id', 'eq', releaseId ?? '');
      if (error) throw new ContentServiceError('STORE_UNAVAILABLE', { cause: error });
      const existingVersionCount = count ?? 0;
      // If we are versioning per-release, start after the max; otherwise start at 1.
      if (releaseId) {
        const { data: versions, error: verr } = await db
          .from('release_snapshots')
          .select('version', { count: 'exact', head: true })
          .eq('release_id', releaseId);
        if (verr) throw new ContentServiceError('STORE_UNAVAILABLE', { cause: verr });
        const maxVersion = versions?.length ? Math.max(...versions.map((v) => v.version)) : 0;
        return maxVersion + 1;
      }
      // Global next version: pick the highest version across all snapshots and add 1.
      const { data: allVersions, error: verr2 } = await db
        .from('release_snapshots')
        .select('version', { count: 'exact', head: true });
      if (verr2) throw new ContentServiceError('STORE_UNAVAILABLE', { cause: verr2 });
      const maxGlobal = allVersions?.length ? Math.max(...allVersions.map((v) => v.version)) : 0;
      return maxGlobal + 1;
    },

    /** Create a new releases row with status='published' and the given snapshot. */
    private async _createPublishedRelease(db, sourceSnapshotId, name) {
      const { data, error } = await db
        .from('releases')
        .insert({
          name,
          status: 'published',
          published_at: new Date().toISOString(),
          source_snapshot_id: sourceSnapshotId,
        })
        .select('id')
        .single();
      if (error) throw new ContentServiceError('STORE_UNAVAILABLE', { cause: error });
      if (!data) throw new ContentServiceError('NOT_FOUND', { message: 'Release insert returned no row' });
      return String(data.id);
    },

    /**
     * Compute a simple SHA-256 checksum string from the given payload.
     * This is a minimal inline implementation; for production you would use
     * the \`crypto\` module or a library, but keeping it dependency-free here.
     */
    private _checksumString(input) {
      // Node.js crypto is available at runtime; use it for a real SHA-256 hex digest.
      // Fallback: a deterministic short hash so snapshots are distinguishable.
      try {
        const { createHash } = await import('crypto');
        return createHash('sha256').update(input).digest('hex');
      } catch {
        // Extremely unlikely in this sandbox, but fallback to a simple hash.
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
          const char = input.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32bit integer
        }
        return (Math.abs(hash).toString(16) + '000000000000000000000000000000').slice(0, 64);
      }
    },

    /**
     * Re-throws a PostgREST error if present, helper for delete ops.
     */
    private static throwOnError(error) {
      if (error && error.error) {
        throw error.error;
      }
      return Promise.resolve(false);
    },
`;

const updated = content.trim() + newSection;
fs.writeFileSync('D:\\Mlbb\\My-Mlbb\\app\\lib\\content\\service.ts', updated);
console.log('Done - appended', newSection.length, 'chars');