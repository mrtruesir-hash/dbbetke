/* DBBet Kenya — live odds
 * Drives two components from the same /api/odds proxy:
 *   #odds-widget  — full betting-page widget (Live + Upcoming tabs)
 *   #live-strip   — slim homepage teaser (live matches only, auto-hides when none)
 *
 * NOTE: field mapping (mapEvent/extract1x2) is defensive and will be tightened
 * to the exact Marketing API fields after the first real (non-403) response.
 */
(function () {
  initWidget(document.getElementById("odds-widget"));
  initStrip(document.getElementById("live-strip"));

  /* ---------------------- betting-page widget ---------------------- */

  function initWidget(root) {
    if (!root) return;
    var endpoint = root.dataset.endpoint || "/api/odds";
    var betLink = root.dataset.betLink || "#";
    var grid = root.querySelector(".odds-grid");
    var fallback = root.querySelector(".odds-fallback");
    var updated = root.querySelector(".odds-updated");
    var tabs = toArray(root.querySelectorAll(".odds-tab"));
    var data = { live: [], prematch: [] };
    var active = "live";

    skeletons(grid, 6);
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { active = t.dataset.feed; syncTabs(); render(); });
    });

    fetch(endpoint, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        data.live = normalizeFeed(json && json.live, true);
        data.prematch = normalizeFeed(json && json.prematch, false);
        if (json && json.updatedAt) setUpdated(json.updatedAt);
        if (!data.live.length && data.prematch.length) { active = "prematch"; syncTabs(); }
        render();
      })
      .catch(function () { render(); });

    function render() {
      var list = data[active] || [];
      grid.dataset.state = "ready";
      if (!list.length) { grid.innerHTML = ""; grid.hidden = true; fallback.hidden = false; return; }
      grid.hidden = false; fallback.hidden = true;
      grid.innerHTML = list.map(fullCard.bind(null, betLink)).join("");
    }
    function syncTabs() {
      tabs.forEach(function (x) { x.classList.toggle("is-active", x.dataset.feed === active); });
    }
    function setUpdated(iso) {
      var d = new Date(iso);
      if (isNaN(d)) return;
      updated.hidden = false;
      updated.textContent = "Updated " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }

  /* ---------------------- homepage live strip ---------------------- */

  function initStrip(strip) {
    if (!strip) return;
    var endpoint = strip.dataset.endpoint || "/api/odds";
    var betLink = strip.dataset.betLink || "#";
    var row = strip.querySelector(".live-strip-row");

    fetch(endpoint, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var live = normalizeFeed(json && json.live, true).slice(0, 3);
        if (!live.length) return; // stay hidden
        row.innerHTML = live.map(miniCard.bind(null, betLink)).join("");
        strip.hidden = false;
      })
      .catch(function () { /* stay hidden */ });
  }

  /* ------------------------------ views ------------------------------ */

  function fullCard(betLink, ev) {
    var when = ev.live
      ? '<span class="odds-when is-live">' + esc(ev.time || "Live") + "</span>"
      : '<span class="odds-when">' + esc(ev.time || "") + "</span>";
    return '<article class="odds-card"><div class="odds-top">' +
      '<span class="odds-league">' + esc(ev.league || "Football") + "</span>" + when + "</div>" +
      '<div class="odds-teams"><div class="odds-team">' + esc(ev.home || "&mdash;") +
      '</div><div class="odds-vs">vs</div><div class="odds-team">' + esc(ev.away || "&mdash;") + "</div></div>" +
      '<div class="odds-markets">' + picks(betLink, ev, true) + "</div></article>";
  }

  function miniCard(betLink, ev) {
    var score = ev.score ? '<span class="lm-score">' + esc(ev.score) + "</span>" : '<span class="lm-vs">v</span>';
    return '<a class="live-mini" rel="nofollow sponsored" href="' + esc(ev.link || betLink) + '">' +
      '<span class="lm-badge">LIVE</span>' +
      '<span class="lm-teams">' + esc(ev.home || "&mdash;") + score + esc(ev.away || "&mdash;") + "</span>" +
      '<span class="lm-odds">' + picks(betLink, ev, false) + "</span>" +
      '<span class="lm-cta">Watch &amp; bet →</span></a>';
  }

  function picks(betLink, ev, asLinks) {
    return ["1", "X", "2"].map(function (lbl, i) {
      var o = ev.odds[i];
      var val = o == null ? "&ndash;" : fmt(o);
      var cls = asLinks ? "odds-pick" : "lm-pick";
      var lc = asLinks ? "odds-lbl" : "lm-lbl";
      var vc = asLinks ? "odds-val" : "lm-val";
      var inner = '<span class="' + lc + '">' + lbl + '</span><span class="' + vc + '">' + val + "</span>";
      if (!asLinks) return '<span class="' + cls + '">' + inner + "</span>";
      if (o == null) return '<span class="' + cls + ' is-empty">' + inner + "</span>";
      return '<a class="' + cls + '" rel="nofollow sponsored" href="' + esc(ev.link || betLink) + '">' + inner + "</a>";
    }).join("");
  }

  /* -------------------- normalization (to refine) -------------------- */

  function normalizeFeed(feed, live) {
    return extractArray(feed)
      .map(function (e) { return mapEvent(e, live); })
      .filter(function (e) { return e && (e.home || e.away); })
      .slice(0, 10);
  }
  function extractArray(feed) {
    if (Array.isArray(feed)) return feed;
    if (!feed || typeof feed !== "object") return [];
    var keys = ["sportEvents", "events", "data", "items", "result", "list"];
    for (var i = 0; i < keys.length; i++) if (Array.isArray(feed[keys[i]])) return feed[keys[i]];
    for (var k in feed) if (Array.isArray(feed[k]) && feed[k].length && typeof feed[k][0] === "object") return feed[k];
    return [];
  }
  function mapEvent(e, live) {
    return {
      home: pick(e, ["opp1Name", "team1Name", "name1", "homeName", "home", "competitor1"]),
      away: pick(e, ["opp2Name", "team2Name", "name2", "awayName", "away", "competitor2"]),
      league: pick(e, ["tournamentName", "tournament", "league", "champName", "competition"]),
      score: pick(e, ["score", "scoreFull", "currentScore", "result"]),
      live: live,
      time: formatWhen(pick(e, ["minute", "matchTime", "dateStart", "startTime", "start", "timestamp"]), live),
      odds: extract1x2(e),
      link: pick(e, ["link", "url", "deeplink"]),
    };
  }
  function extract1x2(e) {
    var markets = e.markets || e.odds || e.oddsList || [];
    if (!Array.isArray(markets)) return [null, null, null];
    var vals = markets
      .map(function (m) { return m && (m.oddsMarket != null ? m.oddsMarket : m.odds != null ? m.odds : m.value); })
      .filter(function (v) { return typeof v === "number"; });
    return [vals[0] != null ? vals[0] : null, vals[1] != null ? vals[1] : null, vals[2] != null ? vals[2] : null];
  }

  /* ------------------------------ helpers ------------------------------ */

  function pick(o, keys) {
    for (var i = 0; i < keys.length; i++) { var v = o[keys[i]]; if (v != null && v !== "") return v; }
    return "";
  }
  function formatWhen(ts, live) {
    if (live) {
      var m = Number(ts);
      return (m > 0 && m < 130) ? m + "'" : "Live"; // small number → live minute
    }
    var n = Number(ts);
    if (!n) return "";
    if (n < 1e12) n *= 1000;
    var d = new Date(n);
    if (isNaN(d)) return "";
    var t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString()
      ? "Today " + t
      : d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + t;
  }
  function fmt(v) { return (Math.round(Number(v) * 100) / 100).toFixed(2); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toArray(nl) { return Array.prototype.slice.call(nl); }
  function skeletons(grid, n) {
    var html = "";
    for (var i = 0; i < n; i++) html += '<article class="odds-card is-skeleton"></article>';
    grid.innerHTML = html;
  }
})();
