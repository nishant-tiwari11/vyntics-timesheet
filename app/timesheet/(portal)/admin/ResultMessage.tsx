export type Result = { ok: boolean; text: string } | null;

// One live region for success and error messages. Always rendered so screen readers announce changes.
export default function ResultMessage({ result }: { result: Result }) {
  return (
    <div aria-live="polite" className="ts-result">
      {result &&
        (result.ok ? (
          <p className="ts-success" role="status">
            {result.text}
          </p>
        ) : (
          <p className="ts-alert" role="alert">
            {result.text}
          </p>
        ))}
    </div>
  );
}
