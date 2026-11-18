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
