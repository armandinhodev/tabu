import type { Team } from "../entities/Team";
import { NoEligibleDescriptorError } from "../errors/DomainError";
import type { PlayerId, TeamId } from "../value-objects/PlayerId";

/**
 * Los equipos se alternan en el orden en que fueron creados; dentro de cada
 * equipo el descriptor rota en FIFO y se saltean los desconectados.
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

export function nextDescriptor(team: Team): DescriptorSelection {
  const total = team.players.length;

  if (total === 0) {
    throw new NoEligibleDescriptorError(team.name);
  }

  for (let offset = 0; offset < total; offset += 1) {
    const index = (team.turnCursor + offset) % total;
    const player = team.players[index];

    if (player !== undefined && player.connected) {
      return {
        team: { ...team, turnCursor: (index + 1) % total },
        descriptorId: player.id,
      };
    }
  }

  throw new NoEligibleDescriptorError(team.name);
}
