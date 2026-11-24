import {Easing} from 'remotion';

/**
 * House easing curves. Motion should feel weighty and deliberate: fast out of
 * the gate, long soft landing. No bounces, no overshoot on type.
 */
export const ease = {
  /** Default for entrances: quick start, long settle. */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** Exits and things leaving the frame. */
  in: Easing.bezier(0.7, 0, 0.84, 0),
  /** Symmetric moves: transitions, camera pushes between two states. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Very slow drift for Ken Burns style camera moves. */
  drift: Easing.bezier(0.33, 0, 0.67, 1),
  /** Counters: decelerate hard so the final digits land slowly. */
  count: Easing.bezier(0.05, 0.7, 0.1, 1),
} as const;

/** Durations in frames at 30fps. */
export const dur = {
  micro: 6,
  short: 12,
  base: 20,
  long: 32,
  transition: 22,
} as const;
