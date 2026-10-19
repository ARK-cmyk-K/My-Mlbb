export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-24 text-center">
      <h2 className="font-display text-3xl font-semibold mb-4 text-foreground">
        Admin Login
      </h2>
      <p className="text-muted mb-8">
        Please sign in with your admin credentials to access the dashboard.
      </p>

      {/* In a full implementation, this would have a sign-in form that
          redirects to Supabase Auth, then configures the admin identity
          mapping after the user is created. */}
      <div className="flex flex-col items-center gap-4">

        {/* Supabase Auth sign-in would go here */}
        {/* <button className="btn-primary">
          Continue with Supabase
        </button> */}

        <p className="text-sm">
          After signing in, an operator must configure the admin mapping by
          setting the admin user ID in the database. This is typically done
          via a server-side script or admin UI after the admin user is
          created in Supabase Auth.
        </p>
      </div>
    </div>
  );
}