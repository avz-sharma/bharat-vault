import type { FormEvent, ReactNode } from "react";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Form({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}
export function Proof({ value }: { value: unknown }) {
  return (
    <details>
      <summary>View proof</summary>
      <pre>
        {JSON.stringify(
          value,
          (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
          2,
        )}
      </pre>
    </details>
  );
}
