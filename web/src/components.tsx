import { useEffect, useRef } from "react";
export function Alert({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [text]);
  return (
    <div className="alert" role="alert" tabIndex={-1} ref={ref}>
      {text}
    </div>
  );
}
export function Loading({ text = "Loading requests…" }: { text?: string }) {
  return (
    <p className="notice" role="status">
      {text}
    </p>
  );
}
export function Status({ value }: { value: string }) {
  return <span className={"badge " + value}>{value.replaceAll("_", " ")}</span>;
}
export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
    document.title = title + " · CampusFix";
  }, [title]);
  return (
    <header className="page-heading">
      <p className="eyebrow">CAMPUS MAINTENANCE</p>
      <h1 ref={ref} tabIndex={-1}>
        {title}
      </h1>
      <p>{subtitle}</p>
    </header>
  );
}
