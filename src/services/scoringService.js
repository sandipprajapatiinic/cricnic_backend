const mongoose = require('mongoose');

function toObjectId(ref) {
  if (ref == null) return null;
  if (ref instanceof mongoose.Types.ObjectId) return ref;
  if (typeof ref === 'string' && mongoose.Types.ObjectId.isValid(ref)) {
    return new mongoose.Types.ObjectId(ref);
  }
  if (typeof ref === 'object' && ref._id != null) {
    return toObjectId(ref._id);
  }
  return null;
}

function swapStrikerNonStriker(match) {
  const a = toObjectId(match.striker);
  const b = toObjectId(match.nonStriker);
  if (!a || !b || a.equals(b)) return;
  match.striker = b;
  match.nonStriker = a;
}

function idKey(ref) {
  if (ref == null) return '';
  if (typeof ref === 'object' && ref.toString) return ref.toString();
  return String(ref);
}

function nextStrikerAfterWicket(match) {
  const dismissedId = idKey(match.striker);
  const nonStr = idKey(match.nonStriker);
  const dismissed = new Set((match.dismissedPlayers || []).filter(Boolean).map((id) => idKey(id)));
  dismissed.add(dismissedId);

  const order = (match.battingOrder || []).filter(Boolean).map((id) => idKey(id));
  for (const pid of order) {
    if (!pid || !mongoose.Types.ObjectId.isValid(pid)) continue;
    if (pid === nonStr) continue;
    if (dismissed.has(pid)) continue;
    return new mongoose.Types.ObjectId(pid);
  }
  return null;
}

function parseRunValue(runs, max = 6) {
  const n = Number.parseInt(String(runs ?? 0), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

/**
 * Mutates match. Returns ball log for persistence + stat hints.
 */
function applyDelivery(match, input) {
  const { eventType, runs: rawRuns = 0 } = input;

  if (match.status === 'completed') {
    throw new Error('Match is already completed');
  }
  if (match.status === 'scheduled') {
    match.status = 'live';
  }

  if (!match.striker || !match.nonStriker || !match.bowler) {
    throw new Error('Set striker, non-striker, and bowler before scoring');
  }

  const strikerAtStart = toObjectId(match.striker);
  const bowlerAtStart = toObjectId(match.bowler);

  const completedBefore = match.overs.completed;
  const ballsBefore = match.overs.balls;
  const overDisplay = completedBefore + 1;
  const ballDisplay = ballsBefore + 1;

  let legalDelivery = true;
  let totalRunsOnDelivery = 0;
  let extrasKind = 'none';
  let extrasCount = 0;
  let extrasExtraRuns = 0;
  let wicket = false;
  let rotateForCrossing = false;
  /** True when this delivery was the 6th legal ball of the over (over just completed). */
  let rotateForNewOver = false;
  let batRunsCreditedToStriker = 0;

  switch (eventType) {
    case 'run': {
      const r = parseRunValue(rawRuns, 6);
      if (![0, 1, 2, 3, 4, 6].includes(r)) {
        throw new Error('Runs must be 0, 1, 2, 3, 4, or 6');
      }
      totalRunsOnDelivery = r;
      match.score += r;
      batRunsCreditedToStriker = r;
      if (r % 2 === 1) rotateForCrossing = true;
      break;
    }
    case 'wide': {
      legalDelivery = false;
      extrasKind = 'wide';
      extrasCount = 1;
      const additional = parseRunValue(rawRuns, 6);
      extrasExtraRuns = additional;
      totalRunsOnDelivery = 1 + additional;
      match.score += totalRunsOnDelivery;
      match.extras.wides += 1;
      batRunsCreditedToStriker = additional;
      if (additional % 2 === 1) rotateForCrossing = true;
      break;
    }
    case 'noball': {
      legalDelivery = false;
      extrasKind = 'noball';
      extrasCount = 1;
      const batRuns = parseRunValue(rawRuns, 6);
      extrasExtraRuns = batRuns;
      totalRunsOnDelivery = 1 + batRuns;
      match.score += totalRunsOnDelivery;
      match.extras.noBalls += 1;
      batRunsCreditedToStriker = batRuns;
      if (batRuns % 2 === 1) rotateForCrossing = true;
      break;
    }
    case 'wicket': {
      wicket = true;
      match.wickets += 1;
      totalRunsOnDelivery = 0;
      batRunsCreditedToStriker = 0;
      break;
    }
    case 'bye': {
      const br = parseRunValue(rawRuns, 6);
      totalRunsOnDelivery = br;
      match.score += br;
      batRunsCreditedToStriker = 0;
      extrasKind = 'bye';
      extrasCount = 1;
      extrasExtraRuns = br;
      match.extras.byes = (match.extras.byes || 0) + br;
      if (br % 2 === 1) rotateForCrossing = true;
      break;
    }
    case 'legbye': {
      const lr = parseRunValue(rawRuns, 6);
      totalRunsOnDelivery = lr;
      match.score += lr;
      batRunsCreditedToStriker = 0;
      extrasKind = 'legbye';
      extrasCount = 1;
      extrasExtraRuns = lr;
      match.extras.legByes = (match.extras.legByes || 0) + lr;
      if (lr % 2 === 1) rotateForCrossing = true;
      break;
    }
    default:
      throw new Error('Invalid eventType');
  }

  if (legalDelivery && (eventType === 'run' || eventType === 'wicket' || eventType === 'bye' || eventType === 'legbye')) {
    match.overs.balls += 1;
    if (match.overs.balls >= 6) {
      match.overs.completed += 1;
      match.overs.balls = 0;
      rotateForNewOver = true;
    }
  }

  const ballLog = {
    over: overDisplay,
    ball: ballDisplay,
    runs: totalRunsOnDelivery,
    extras: { kind: extrasKind, count: extrasCount, extraRuns: extrasExtraRuns },
    wicket,
    strikerId: strikerAtStart,
    bowlerId: bowlerAtStart,
    eventType,
    legalDelivery,
    batRunsCreditedToStriker,
    rotateForNewOver,
  };

  if (wicket) {
    match.dismissedPlayers.push(toObjectId(match.striker));
    const nextS = nextStrikerAfterWicket(match);
    if (nextS) {
      match.striker = nextS;
    } else {
      match.striker = undefined;
    }
  }

  match.striker = toObjectId(match.striker);
  match.nonStriker = toObjectId(match.nonStriker);

  if (rotateForCrossing && match.striker && match.nonStriker) {
    swapStrikerNonStriker(match);
  }
  if (rotateForNewOver && match.striker && match.nonStriker) {
    swapStrikerNonStriker(match);
  }

  const allOut = match.wickets >= 10;
  const oversDone =
    match.overs.completed >= match.totalOvers && match.overs.balls === 0 && match.overs.completed > 0;
  if (allOut || oversDone) {
    match.status = 'completed';
  }

  return ballLog;
}

module.exports = { applyDelivery, swapStrikerNonStriker, nextStrikerAfterWicket, parseRunValue };
