/** Google's four-colour mark. Fixed brand colours, so it is exempt from the token rule. */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        d="M21.6 12.2c0-.7-.06-1.2-.18-1.8H12v3.4h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.1z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.96-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 01-5.6-4.1H3.1v2.6A10 10 0 0012 22z"
        fill="#34A853"
      />
      <path d="M6.4 14a6 6 0 010-3.9V7.5H3.1a10 10 0 000 9l3.3-2.5z" fill="#FBBC05" />
      <path
        d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A10 10 0 003.1 7.5l3.3 2.6A5.9 5.9 0 0112 5.9z"
        fill="#EA4335"
      />
    </svg>
  );
}
