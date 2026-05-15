import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

/**
 * Production Event Bus
 * 
 * Handles internal synchronous and asynchronous communication.
 */
class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
    }

    emit(event, data) {
        logger.debug(`[EventBus] Emitting: ${event}`);
        return super.emit(event, data);
    }
}

const eventBus = new EventBus();

// Log any unhandled events in dev
if (process.env.NODE_ENV !== 'production') {
    eventBus.on('error', (err) => {
        logger.error('[EventBus] Error:', err);
    });
}

export default eventBus;
export { eventBus };
