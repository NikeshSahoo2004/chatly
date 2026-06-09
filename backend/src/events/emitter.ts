import { EventEmitter } from 'events';

export const eventEmitter = new EventEmitter();

// Log event registration errors
eventEmitter.on('error', (err) => {
  console.error('[EventEmitter] Error:', err);
});
