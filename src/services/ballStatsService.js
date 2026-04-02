const Player = require('../models/Player');

/**
 * Apply cumulative player stats after one delivery.
 * - Bowler: runs conceded += total runs on ball; balls bowled +=1 only if legal.
 * - Striker (at start of ball): balls faced +=1 if legal; batting runs += runs credited off bat/extras to striker.
 */
async function applyDeliveryPlayerStats({
  eventType,
  legalDelivery,
  totalRunsOnDelivery,
  batRunsCreditedToStriker,
  strikerBefore,
  bowlerBefore,
}) {
  const tasks = [];

  if (bowlerBefore && totalRunsOnDelivery > 0) {
    tasks.push(
      Player.updateOne({ _id: bowlerBefore }, { $inc: { 'stats.runsConceded': totalRunsOnDelivery } })
    );
  }
  if (bowlerBefore && legalDelivery) {
    tasks.push(Player.updateOne({ _id: bowlerBefore }, { $inc: { 'stats.ballsBowled': 1 } }));
  }
  if (strikerBefore && legalDelivery) {
    tasks.push(Player.updateOne({ _id: strikerBefore }, { $inc: { 'stats.balls': 1 } }));
  }
  if (strikerBefore && batRunsCreditedToStriker > 0) {
    tasks.push(
      Player.updateOne({ _id: strikerBefore }, { $inc: { 'stats.runs': batRunsCreditedToStriker } })
    );
  }
  if (eventType === 'wicket' && bowlerBefore) {
    tasks.push(Player.updateOne({ _id: bowlerBefore }, { $inc: { 'stats.wickets': 1 } }));
  }

  await Promise.all(tasks.map((p) => p.catch(() => {})));
}

/**
 * Undo one delivery's effect on Player.stats (mirror of applyDeliveryPlayerStats).
 * @param {import('mongoose').Document|object} ballDoc — Ball document or lean object
 */
async function reverseDeliveryPlayerStats(ballDoc) {
  const eventType = ballDoc.eventType;
  const legalDelivery = !!ballDoc.legalDelivery;
  const totalRunsOnDelivery = ballDoc.runs ?? 0;
  const strikerBefore = ballDoc.strikerId;
  const bowlerBefore = ballDoc.bowlerId;
  const batRuns =
    eventType === 'run'
      ? totalRunsOnDelivery
      : eventType === 'bye' || eventType === 'legbye'
        ? 0
        : ballDoc.extras?.extraRuns ?? 0;

  const tasks = [];

  if (bowlerBefore && totalRunsOnDelivery > 0) {
    tasks.push(
      Player.updateOne({ _id: bowlerBefore }, { $inc: { 'stats.runsConceded': -totalRunsOnDelivery } })
    );
  }
  if (bowlerBefore && legalDelivery) {
    tasks.push(Player.updateOne({ _id: bowlerBefore }, { $inc: { 'stats.ballsBowled': -1 } }));
  }
  if (strikerBefore && legalDelivery) {
    tasks.push(Player.updateOne({ _id: strikerBefore }, { $inc: { 'stats.balls': -1 } }));
  }
  if (strikerBefore && batRuns > 0) {
    tasks.push(Player.updateOne({ _id: strikerBefore }, { $inc: { 'stats.runs': -batRuns } }));
  }
  if (eventType === 'wicket' && bowlerBefore) {
    tasks.push(Player.updateOne({ _id: bowlerBefore }, { $inc: { 'stats.wickets': -1 } }));
  }

  await Promise.all(tasks.map((p) => p.catch(() => {})));
}

module.exports = { applyDeliveryPlayerStats, reverseDeliveryPlayerStats };
