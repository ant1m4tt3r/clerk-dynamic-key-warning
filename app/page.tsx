export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: "48rem",
        lineHeight: 1.6,
      }}
    >
      <h1>Clerk key-prop warning</h1>
      <p>Open the browser console. React logs, on every page load:</p>
      <blockquote
        style={{
          borderLeft: "3px solid #ccc",
          margin: 0,
          padding: "0.5rem 1rem",
        }}
      >
        Each child in a list should have a unique &quot;key&quot; prop.
        <br />
        Check the render method of <code>__experimental_CheckoutProvider</code>. It was
        passed a child from ClerkProvider.
      </blockquote>
      <p>
        Nothing in this app renders a list. The array comes from inside
        ClerkProvider. See <code>app/layout.tsx</code> and <code>README.md</code>.
      </p>
    </main>
  );
}
