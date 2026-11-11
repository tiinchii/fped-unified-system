interface Props { title: string; phase: string; items: string[] }

/** Stands in for a module that is built in a later phase, so the menu already shows where it will be. */
export function ComingSoonPage({ title, phase, items }: Props) {
  return (
    <>
      <h2>{title}</h2>
      <p className="sub">Coming in {phase}.</p>
      <div className="card">
        <h3>What this page will do</h3>
        <ul className="plain">{items.map((i) => <li key={i}>{i}</li>)}</ul>
      </div>
    </>
  );
}
