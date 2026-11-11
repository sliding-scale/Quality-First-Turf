/** Pages anyone with the link can open (the client's quote): no sign-in, no app shell. The page brings its own plain Convex connection. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="public-page">{children}</div>;
}
