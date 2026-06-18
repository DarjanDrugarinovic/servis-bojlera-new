import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
const PHONE = "061/311-20-73";
function App() {
  return (
    <main className="page">
      <Header />
      <Hero />
      <Services />
      <Why />
      <Brands />
      <Cta />
    </main>
  );
}
function Header() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="flame">♨</div>
        <div className="brandText">
          SERVIS <span>BOJLERA</span>
          <br />
          BEOGRAD
        </div>
      </div>
      <a className="callTop" href="tel:+381613112073">
        ☎ {PHONE}
      </a>
      <div className="hamb">
        <i />
        <i />
        <i />
      </div>
    </header>
  );
}
function Hero() {
  return (
    <section className="hero">
      <div className="heroInner">
        <div className="copy">
          <div className="badge">
            ◷ <b>HITNE INTERVENCIJE</b> 00-24
          </div>
          <h1>
            SERVIS <span>BOJLERA</span>
            <em>BEOGRAD</em>
          </h1>
          <p>
            Brza reakcija. Kvalitetan servis.
            <br />
            Garancija na rad i ugrađene delove.
          </p>
          <ul>
            {[
              "Dolazak za 30-60 min",
              "Svi delovi na stanju",
              "Garancija na rad",
              "Ceo Beograd",
            ].map((x) => (
              <li key={x}>
                <b>✓</b>
                {x}
              </li>
            ))}
          </ul>
          <a className="heroCall" href="tel:+381613112073">
            ☎ {PHONE}
          </a>
          <div className="trust">♢ POUZDAN SERVIS VEĆ 20+ GODINA</div>
        </div>
        <div className="visual">
          <div className="temple" />
          <div className="podium" />
          <div className="boiler">
            <div className="screen">60</div>
            <div className="pipes">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="shield">
            ✓<br />
            <b>
              GARANCIJA
              <br />
              NA RAD
            </b>
          </div>
          <div className="years">
            <small>VIŠE OD</small>
            <b>20</b>
            <span>
              GODINA
              <br />
              ISKUSTVA
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
function Services() {
  let arr = [
    ["⌘", "Popravka bojlera", "Otklanjanje svih kvarova brzo i efikasno."],
    ["⚙", "Montaža bojlera", "Stručna ugradnja svih vrsta bojlera."],
    ["⇄", "Zamena grejača", "Originalni grejači uz garanciju."],
    ["◖", "Čišćenje kamenca", "Produžite vek bojlera i uštedite energiju."],
  ];
  return (
    <section className="section">
      <div className="panel">
        <div className="eyebrow">NAŠE USLUGE</div>
        <h2>Sve za vaš bojler na jednom mestu</h2>
        <div className="grid services">
          {arr.map(([i, t, d]) => (
            <article className="service" key={t}>
              <div className="ico">{i}</div>
              <div>
                <h3>{t}</h3>
                <p>{d}</p>
                <span>→</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
function Why() {
  let arr = [
    ["♟", "20+", "GODINA ISKUSTVA"],
    ["♢", "100%", "GARANCIJA NA RAD"],
    ["◷", "30-60", "MINUTA DOLAZAK"],
    ["●", "CEO", "BEOGRAD POKRIVEN"],
  ];
  return (
    <section className="section">
      <div className="panel">
        <div className="eyebrow">ZAŠTO IZABRATI NAS?</div>
        <h2>Iskustvo. Kvalitet. Pouzdanost.</h2>
        <div className="stats">
          {arr.map(([i, b, s]) => (
            <div className="stat" key={b}>
              <div>{i}</div>
              <b>{b}</b>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function Brands() {
  return (
    <section className="section">
      <div className="panel brands">
        <div className="eyebrow">POPRAVLJAMO SVE BRENDOVE</div>
        <p>
          ⌂ ARISTON <strong>gorenje</strong> metalac ⓗ BOSCH TESY tatramat
        </p>
      </div>
    </section>
  );
}
function Cta() {
  return (
    <>
      <div className="cta">
        <a className="orange" href="tel:+381613112073">
          ☎{" "}
          <span>
            POZOVITE NAS
            <br />
            <b>{PHONE}</b>
            <small>Dostupni 00-24h</small>
          </span>
        </a>
        <a className="green" href="https://wa.me/381613112073">
          ☏{" "}
          <span>
            WHATSAPP
            <br />
            <small>Brza poruka</small>
          </span>
        </a>
      </div>
      <div className="bottom">
        <span>
          ◴<br />
          Bez čekanja
        </span>
        <span>
          ♧<br />
          Povoljne cene
        </span>
        <span>
          ☆<br />
          Profesionalni servis
        </span>
        <span>
          ▤<br />
          Račun i garancija
        </span>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
