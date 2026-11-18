import { ApiError } from "../utils/errors.js";
import { casUpdate } from "./cas.js";
import { SESSION_TTL_MS } from "./score-service.js";
import { adventureTitleKeys, legacyAdventureClaim } from "./adventure-title-evidence.js";

const minigames = new Set(["volleyball", "whack"]);
export const validEvidenceId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(id);

export function createAdventureTitleService({ db, collections, now, staging }) {
  async function settle(profile, id, kind, evidence) {
    if (!validEvidenceId(id) || !minigames.has(kind)) throw new ApiError("VALIDATION_FAILED");
    const { playerId } = profile;
    const location = `adventureTitleSessions/${playerId}/${id}`;
    if (evidence === undefined) {
      await casUpdate(db, location, (existing) => {
        if (existing && existing.kind !== kind) throw new ApiError("DUPLICATE_SUBMISSION");
        return existing ? { result: existing } : { value: { kind, startedAt: now() } };
      });
      return { id };
    }
    const keys = adventureTitleKeys(evidence);
    if (!keys || evidence.kind !== kind) throw new ApiError("VALIDATION_FAILED");
    const result = kind === "volleyball"
      ? { opponent: evidence.opponent, playerScore: evidence.playerScore, cpuScore: evidence.cpuScore, winner: evidence.winner }
      : { score: evidence.score };
    const signature = JSON.stringify(result);
    await casUpdate(db, location, (session) => {
      if (!session || session.kind !== kind) throw new ApiError("VALIDATION_FAILED");
      if (session.signature !== undefined) {
        if (signature !== session.signature) throw new ApiError("DUPLICATE_SUBMISSION");
        return { result: session };
      }
      const at = now();
      const elapsed = at - session.startedAt;
      if (elapsed > SESSION_TTL_MS || elapsed < (kind === "whack" ? 29000 : 1000)) throw new ApiError("VALIDATION_FAILED");
      return { value: { ...session, signature, result, completedAt: at } };
    });
    const fresh = await collections.grantKeys(playerId, profile, { titles: keys }, { type: "adventure_minigame_client", id, kind });
    return { id, titles: keys, fresh };
  }

  async function review(profile, body, admin) {
    if (!body || !Array.isArray(body.evidence) || body.evidence.length < 1 || body.evidence.length > 25 ||
        typeof body.note !== "string" || !body.note.trim() || body.note.length > 500) throw new ApiError("VALIDATION_FAILED");
    const reviews = body.evidence.map((evidence) => {
      if (!validEvidenceId(evidence?.id)) throw new ApiError("VALIDATION_FAILED");
      const titles = adventureTitleKeys(evidence);
      if (!titles?.length) throw new ApiError("VALIDATION_FAILED");
      const { id, kind, opponent, playerScore, cpuScore, winner, score, track } = evidence;
      const result = kind === "continent" ? { track: { kills: track.kills, damage: track.damage, purchases: track.purchases } }
        : kind === "volleyball" ? { opponent, playerScore, cpuScore, winner } : { score };
      return { id, kind, titles, result };
    });
    const { playerId } = profile;
    const fresh = { titles: [], avatars: [] };
    for (const { id, kind, titles, result } of reviews) {
      const source = { type: "adventure_evidence_admin", id, kind, by: admin.uid, note: body.note.trim() };
      const reviewId = `${playerId}_adventure_${kind}_${id}`;
      const signature = JSON.stringify(result);
      const audit = await casUpdate(db, `collectionAudit/${reviewId}`, (existing) => {
        if (existing) {
          if (existing.signature !== signature) throw new ApiError("DUPLICATE_SUBMISSION");
          return { result: existing };
        }
        const record = { ...source, signature, playerId, titles, result, action: "adventure_evidence_review", at: now() };
        return { value: record, result: record };
      });
      const grant = await collections.grantKeys(playerId, profile, { titles }, { ...source, by: audit.result.by, note: audit.result.note });
      fresh.titles.push(...grant.titles);
    }
    return { fresh, collection: await collections.get(playerId, profile) };
  }

  async function migrate(profile, body) {
    const { playerId } = profile;
    if (body.playerId !== playerId || body.mode !== "production" || body.workspace !== "__c1u__prd__" + playerId ||
        !Array.isArray(body.claims) || body.claims.length < 1 || body.claims.length > 7) throw new ApiError("VALIDATION_FAILED");
    const claims = body.claims.map((item) => {
      if (item?.evidence !== undefined && !validEvidenceId(item.evidence?.id)) throw new ApiError("VALIDATION_FAILED");
      const claim = legacyAdventureClaim(item, now(), staging);
      if (!claim) throw new ApiError("VALIDATION_FAILED");
      return claim;
    });
    const confirmed = [];
    if (new Set(claims.map((claim) => claim.titleKey)).size !== claims.length) throw new ApiError("VALIDATION_FAILED");
    for (const claim of claims) {
      const { titleKey, ...provenance } = claim;
      const location = `collectionAudit/${playerId}_adventure_legacy_${titleKey}`;
      const audit = await casUpdate(db, location, (existing) => {
        if (existing) return { result: existing };
        const record = { ...provenance, playerId, titleKey, action: "adventure_legacy_migration", at: now() };
        return { value: record, result: record };
      });
      const accepted = audit.result;
      await collections.grantKeys(playerId, profile, { titles: [titleKey] }, {
        type: "adventure_legacy_client", migratedAt: accepted.at, evidenceLevel: accepted.evidenceLevel,
        legacyUnlockedAt: accepted.unlockedAt, legacyGameVersion: accepted.gameVersion,
        ...(accepted.evidenceId ? { evidenceId: accepted.evidenceId } : {}),
      });
      confirmed.push(titleKey);
    }
    return { confirmed };
  }

  return { settle, review, migrate };
}
