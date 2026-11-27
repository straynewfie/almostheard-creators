export function DangerZone({
  action,
  id,
  buttonLabel,
  confirmation,
  explanation,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  buttonLabel: string;
  confirmation: string;
  explanation: string;
}) {
  return (
    <section className="danger-zone">
      <h2>Danger zone</h2>
      <p>{explanation}</p>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <label className="check">
          <input type="checkbox" name="confirm" required />
          <span>{confirmation}</span>
        </label>
        <button className="danger" type="submit">{buttonLabel}</button>
      </form>
    </section>
  );
}
