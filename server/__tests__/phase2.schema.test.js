import Escrow from '../src/modules/payment/escrow.model.js';
import User from '../src/modules/user/user.model.js';

describe('Phase 2 schemas', () => {
  it('Escrow timestamps are schema options, not a field', () => {
    expect(Escrow.schema.options.timestamps).toBe(true);
    expect(Escrow.schema.path('createdAt')).toBeDefined();
    expect(Escrow.schema.path('updatedAt')).toBeDefined();
    expect(Escrow.schema.paths.timestamps).toBeUndefined();
  });

  it('User schema persists blockReason', () => {
    const path = User.schema.path('blockReason');
    expect(path).toBeDefined();
    expect(path.instance).toBe('String');
    expect(path.defaultValue).toBeNull();
  });
});
