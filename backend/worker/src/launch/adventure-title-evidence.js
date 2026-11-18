const TRACK_KEYS = ["kills", "damage", "purchases"];
const VOLLEYBALL_TITLES = Object.freeze({
  scorpion: "adventure_volleyball_rookie",
  orange: "adventure_volleyball_expert",
  orange_king: "adventure_volleyball_king",
});

export function validAdventureTrack(track) {
  return track !== null && typeof track === "object" && !Array.isArray(track) &&
    Object.keys(track).length === TRACK_KEYS.length &&
    TRACK_KEYS.every((key) => Object.hasOwn(track, key) && Number.isSafeInteger(track[key]) && track[key] >= 0);
}

export function adventureTitleKeys(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const { kind, opponent, playerScore, cpuScore, winner, score, track } = evidence;
  if (kind === "volleyball") {
    const scores = [playerScore, cpuScore];
    if (!Object.hasOwn(VOLLEYBALL_TITLES, opponent) || scores.some((v) => !Number.isInteger(v) || v < 0 || v > 7) ||
        scores.filter((v) => v === 7).length !== 1 || winner !== (playerScore === 7 ? "player" : "cpu")) return null;
    return playerScore === 7 && cpuScore === 0 ? [VOLLEYBALL_TITLES[opponent]] : [];
  }
  if (kind === "whack") {
    if (!Number.isSafeInteger(score) || score < 0) return null;
    return score >= 660 ? ["adventure_whack_legend"] : [];
  }
  if (kind === "continent" && evidence.complete === true && validAdventureTrack(track)) {
    const keys = [];
    if (track.kills === 0) keys.push("adventure_kind_adventurer");
    if (track.kills === 0 && track.damage === 0) keys.push("adventure_peace_ambassador");
    if (track.purchases === 0) keys.push("adventure_super_thrifty");
    return keys;
  }
  return null;
}

const CONTINENT_TITLES = new Set(["adventure_kind_adventurer", "adventure_peace_ambassador", "adventure_super_thrifty"]);
const LEGACY_BUILD = "adventure-v0.4.1-continent1-universe-test-1";
const LEGACY_VOLLEY = /^volleyball:(scorpion|orange|orange_king):7-0$/;
const LEGACY_WHACK = /^whack:(\d{1,8})$/;
const LEGACY_RUN = /^adv-[a-z0-9]+-[a-z0-9]{0,6}$/;

export function legacyAdventureClaim(item, now) {
  const { record, evidence } = item || {};
  if (!record || record.gameId !== "adventure" || record.category !== "adventure" ||
      record.source !== "client" || record.serverConfirmed !== false || record.gameVersion !== LEGACY_BUILD ||
      !Number.isSafeInteger(record.unlockedAt) || record.unlockedAt <= 0 || record.unlockedAt > now) return null;
  const { titleKey, via, challengeId } = record;
  const volley = typeof via === "string" && via.match(LEGACY_VOLLEY);
  const whack = typeof via === "string" && via.match(LEGACY_WHACK);
  const continent = CONTINENT_TITLES.has(titleKey);
  if (continent) {
    if (via !== undefined || typeof challengeId !== "string" || !LEGACY_RUN.test(challengeId)) return null;
  } else if (volley) {
    if (VOLLEYBALL_TITLES[volley[1]] !== titleKey) return null;
  } else if (!whack || Number(whack[1]) < 660 || titleKey !== "adventure_whack_legend") return null;

  if (evidence !== undefined) {
    const matches = continent ? evidence?.kind === "continent" && evidence.id === challengeId
      : volley ? evidence?.kind === "volleyball" && evidence.opponent === volley[1]
      : evidence?.kind === "whack" && evidence.score === Number(whack[1]);
    if (!matches || !adventureTitleKeys(evidence)?.includes(titleKey)) return null;
  }
  return { titleKey, unlockedAt: record.unlockedAt, gameVersion: record.gameVersion,
    ...(typeof challengeId === "string" && LEGACY_RUN.test(challengeId) ? { challengeId } : {}),
    ...(typeof via === "string" ? { via } : {}),
    evidenceLevel: evidence ? "settlement" : "permanent_record", ...(evidence ? { evidenceId: evidence.id } : {}) };
}
