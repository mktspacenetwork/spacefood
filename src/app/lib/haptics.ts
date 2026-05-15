/**
 * Haptic feedback utilities for mobile devices.
 * Uses the Vibration API when available.
 */

export function hapticLight() {
  if ('vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

export function hapticMedium() {
  if ('vibrate' in navigator) {
    navigator.vibrate(30);
  }
}

export function hapticHeavy() {
  if ('vibrate' in navigator) {
    navigator.vibrate(50);
  }
}

export function hapticSuccess() {
  if ('vibrate' in navigator) {
    navigator.vibrate([20, 50, 20]);
  }
}

export function hapticError() {
  if ('vibrate' in navigator) {
    navigator.vibrate([50, 30, 50, 30, 50]);
  }
}
