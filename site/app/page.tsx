const email = "tommy@launchpadlocal.org";

export default function Home() {
  return (
    <section className="sec">
      <div className="wrap narrow">
        <h1>LaunchPad Local</h1>
        <p className="lede">Jacksonville, Florida.</p>
        <p>
          To get in touch, email <a href={`mailto:${email}`}>{email}</a>.
        </p>
      </div>
    </section>
  );
}
