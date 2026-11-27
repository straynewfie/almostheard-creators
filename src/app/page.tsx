import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Mission",
  description:
    "For the music that hasn't found its audience yet. Discover the mission and future of Almost Heard Creators.",
};

export default function MissionPage() {
  const year = new Date().getFullYear();
  return (
    <div className="mission">
      <header className="mission-header">
        <div className="shell nav">
          <a className="brand" href="#top">almost heard<span> / creators</span></a>
          <nav className="navlinks" aria-label="Main navigation">
            <a href="#mission">Mission</a>
            <a href="#ecosystem">Ecosystem</a>
            <a href="#roadmap">Roadmap</a>
          </nav>
        </div>
      </header>
      <main id="top">
        <section className="hero">
          <div className="shell">
            <span className="pill">A new home for independent music · Coming soon</span>
            <div className="eyebrow" style={{ marginTop: 26 }}>Our mission</div>
            <h1>For the music that hasn&apos;t found its audience yet.</h1>
            <p className="lead">Millions of songs compete for attention. Making music available is no longer the biggest challenge. Getting people to discover it is.</p>
            <div className="hero-actions">
              <a className="button" href="#mission">Read our mission</a>
              <a className="quiet" href="#ecosystem">Explore the vision</a>
            </div>
          </div>
        </section>
        <section className="section" id="mission">
          <div className="shell">
            <div className="eyebrow">Why we&apos;re building this</div>
            <h2>Music deserves the chance to be heard.</h2>
            <p>Almost Heard exists to help independent music creators get heard. We aren&apos;t here to replace your creative tools, your distributor or your favourite streaming service. We&apos;re here to complement them: helping you establish your musical identity, present your catalogue, reach new listeners and, eventually, earn additional exposure through a curated listening platform.</p>
            <p className="muted">We want to give the little guy a better chance of being heard.</p>
            <div className="quote">Your music. Your storage. Your catalogue. Your audience.</div>
          </div>
        </section>
        <section className="section" id="ecosystem">
          <div className="shell">
            <div className="eyebrow">One mission. Connected tools.</div>
            <h2>The Almost Heard ecosystem</h2>
            <p className="section-intro">Each part has its own purpose. Together, they help creators move from making music to finding people who want to hear it.</p>
            <div className="grid">
              <article className="panel"><div className="eyebrow">01 · Foundation</div><h3>Creator Dashboard</h3><p>Manage multiple artist identities, organize songs into releases, and upload music and artwork to cloud storage you own.</p></article>
              <article className="panel"><div className="eyebrow">02 · Public presence</div><h3>Creators Website</h3><p>Give your music a shareable home, with artist pages, discographies, browser playback and a way to discover other creators.</p></article>
              <article className="panel"><div className="eyebrow">03 · Discovery</div><h3>Almost Heard Player</h3><p>A dedicated listening experience built around a smaller, curated catalogue where emerging music has room to stand out.</p></article>
              <article className="panel"><div className="eyebrow">04 · Opportunity</div><h3>Weekly Promotions</h3><p>Give qualifying recordings a route into the player through genuine engagement, editorial selection and, eventually, community review.</p></article>
              <article className="panel"><div className="eyebrow">05 · Recognition</div><h3>Creator Achievements</h3><p>Recognize consistent quality and meaningful listener response, rather than simply rewarding publishing volume.</p></article>
              <article className="panel"><div className="eyebrow">06 · Community</div><h3>Promotion Board</h3><p>Invite proven creators to help champion overlooked music, with earned responsibilities and rewards.</p></article>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="shell">
            <div className="eyebrow">Beyond our walls</div>
            <h2>Discovery shouldn&apos;t end here.</h2>
            <p className="section-intro">When someone discovers your music through Almost Heard and follows you on Spotify, Apple Music, YouTube Music or another service, that&apos;s a success. We want to help grow your audience everywhere, not lock it into one platform.</p>
          </div>
        </section>
        <section className="section" id="roadmap">
          <div className="shell">
            <div className="eyebrow">Building toward the mission</div>
            <h2>A platform that grows in stages</h2>
            <p className="section-intro">Almost Heard Creators is in development. The following features describe our vision, not services available today.</p>
            <div className="panel"><strong>Stage 1.</strong> Creator Dashboard and public website. Own, organize, publish and share your catalogue.</div>
            <div className="panel" style={{ marginTop: 12 }}><strong>Stage 2.</strong> Player integration. Introduce a curated listening audience.</div>
            <div className="panel" style={{ marginTop: 12 }}><strong>Stage 3.</strong> Weekly promotions. Give deserving recordings an opportunity for greater visibility.</div>
            <div className="panel" style={{ marginTop: 12 }}><strong>Stage 4.</strong> Creator recognition. Celebrate quality and contribution.</div>
            <div className="panel" style={{ marginTop: 12 }}><strong>Stage 5.</strong> Promotion Board. Bring trusted creators into community curation.</div>
          </div>
        </section>
        <section className="section">
          <div className="shell">
            <div className="eyebrow">What we promise</div>
            <h2>Opportunity, not guarantees.</h2>
            <p className="section-intro">We don&apos;t promise fame, guaranteed promotion, thousands of listeners or commercial success. We aim to provide a place to present your music, retain ownership of your media and have an opportunity to reach listeners who might otherwise never find you.</p>
            <div className="quote">Almost Heard. For the music that hasn&apos;t found its audience yet.</div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="shell">
          <span>© {year} Almost Heard Creators · In development</span>
          <a href="https://www.almostheard.ca/">Visit Almost Heard</a>
        </div>
      </footer>
    </div>
  );
}
