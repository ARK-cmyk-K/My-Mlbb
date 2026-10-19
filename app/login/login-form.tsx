"use client";

import { useActionState } from "react";

import { signInAction, type SignInState } from "../actions/auth-actions";

const initialState: SignInState = {};

/**
 * Admin sign-in form (task 02-01).
 *
 * A client component only so it can show the pending state and the generic
 * error from the Server Action. It holds no credentials beyond the form fields
 * and performs no authentication itself — `signInAction` runs on the server.
 */
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="w-full max-w-sm text-left">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
