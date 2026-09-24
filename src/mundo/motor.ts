import { MotorMundo } from './mundo'

/**
 * Instância única do mundo. Vive fora do React de propósito: o Player, os
 * feeds, o painel de câmera e o fundo do palco falam todos com o mesmo objeto,
 * e ninguém remonta a simulação ao trocar de cena.
 */
export const motor = new MotorMundo()
