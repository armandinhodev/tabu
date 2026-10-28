import type { Team } from "../entities/Team";
import { NoEligibleDescriptorError } from "../errors/DomainError";
import type { PlayerId, TeamId } from "../value-objects/PlayerId";
import type { Rng } from "../rng";

/**
 * Teams alternate in their existing order after a random starting team.
 * Each team draws from its remaining connected descriptors before refilling.
 */
export function nextTeam(teams: readonly Team[], currentTeamId: TeamId | null): Team {
  if (teams.length === 0) {
    throw new NoEligibleDescriptorError("game");
  }

  if (currentTeamId === null) {
    return teams[0] as Team;
  }

  const index = teams.findIndex((team) => team.id === currentTeamId);
  const nextIndex = index < 0 ? 0 : (index + 1) % teams.length;

  return teams[nextIndex] as Team;
}

export interface DescriptorSelection {
  readonly team: Team;
  readonly descriptorId: PlayerId;
}

export function nextDescriptor(team: Team, rng: Rng = () => 0): DescriptorSelection {
  const total = team.players.length;

  if (total === 0) {
    throw new NoEligibleDescriptorError(team.name);
  }

  const connected = Array.from(
    { length: total },
    (_, offset) => team.players[(team.turnCursor + offset) % total]!,
  ).filter((player) => player.connected);
  if (connected.length === 0) {
    throw new NoEligibleDescriptorError(team.name);
  }
  const remaining = connected.filter((player) => team.descriptorQueue?.includes(player.id));
  const eligible = remaining.length > 0 ? remaining : connected;
  const player = eligible[Math.floor(rng() * eligible.length)]!;
  return {
    team: {
      ...team,
      turnCursor: (team.players.findIndex((candidate) => candidate.id === player.id) + 1) % total,
      descriptorQueue: eligible
        .filter((candidate) => candidate.id !== player.id)
        .map((candidate) => candidate.id),
    },
    descriptorId: player.id,
  };
}
