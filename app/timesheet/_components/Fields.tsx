"use client";

import { createContext, useContext, useId } from "react";

// One Input, Select, Textarea and FormField for the whole portal.
// FormField gives its control the id, the "required" flag and the hint/error wiring (aria-describedby,
// aria-invalid), so a page only writes: <FormField label="Date" error={...}><Input type="date" /></FormField>.

type FieldContext = { id: string; describedBy?: string; invalid: boolean; required: boolean };
const Field = createContext<FieldContext | null>(null);

type Size = "md" | "sm";

function cls(base: string, size: Size | undefined, extra?: string, more?: string) {
  return [base, size === "sm" ? "ts-input-sm" : "", more ?? "", extra ?? ""].filter(Boolean).join(" ");
}

function useControl(props: React.AriaAttributes & { id?: string; required?: boolean }) {
  const ctx = useContext(Field);
  const describedBy = [props["aria-describedby"], ctx?.describedBy].filter(Boolean).join(" ") || undefined;
  return {
    id: props.id ?? ctx?.id,
    required: props.required ?? ctx?.required,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (ctx?.invalid ? true : undefined),
  };
}

export function FormField({
  label,
  hint,
  error,
  required,
  srOnlyLabel,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Shown in red under the box; also marks the box as invalid. */
  error?: string | null;
  required?: boolean;
  /** Keep the label for screen readers only (for filters that have no visible label). */
  srOnlyLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : "", hint ? hintId : ""].filter(Boolean).join(" ") || undefined;
  // Error and hint can both show (e.g. a character counter stays while an error is displayed).
  return (
    <Field.Provider value={{ id, describedBy, invalid: !!error, required: !!required }}>
      <div className={`ts-field${className ? ` ${className}` : ""}`}>
        <label htmlFor={id} className={srOnlyLabel ? "ts-sr-only" : undefined}>
          {label}
          {required && (
            <>
              <span className="ts-req" aria-hidden="true">
                *
              </span>
              <span className="ts-sr-only"> (required)</span>
            </>
          )}
        </label>
        {children}
        {error && (
          <p id={errorId} className="ts-field-error" role="alert">
            {error}
          </p>
        )}
        {hint && (
          <p id={hintId} className="ts-hint">
            {hint}
          </p>
        )}
      </div>
    </Field.Provider>
  );
}

export function Input({
  size,
  className,
  autoComplete = "off",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: Size }) {
  const control = useControl(props);
  return <input {...props} {...control} autoComplete={autoComplete} className={cls("ts-input", size, className)} />;
}

export function Select({
  size,
  inline,
  className,
  children,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: Size; inline?: boolean }) {
  const control = useControl(props);
  return (
    <select {...props} {...control} className={cls("ts-input", size, className, inline ? "ts-input-inline" : "")}>
      {children}
    </select>
  );
}

export function Textarea({
  size,
  className,
  autoComplete = "off",
  ref,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { size?: Size; ref?: React.Ref<HTMLTextAreaElement> }) {
  const control = useControl(props);
  return <textarea {...props} {...control} ref={ref} autoComplete={autoComplete} className={cls("ts-input", size, className)} />;
}
