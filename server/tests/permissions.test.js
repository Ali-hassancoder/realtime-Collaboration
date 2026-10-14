import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  ASSIGNABLE_ROLES,
  ACTION_NAMES,
  can,
  canModify,
  outranks,
  permissionsFor,
  isProjectScoped,
} from '../src/modules/workspaces/workspace.permissions.js';

describe('permission matrix', () => {
  test('every role has at least the permissions of the role below it', () => {
    for (let i = 0; i < ROLES.length - 1; i++) {
      const higher = new Set(permissionsFor(ROLES[i]));
      for (const action of permissionsFor(ROLES[i + 1])) {
        assert.ok(higher.has(action), `${ROLES[i]} should be able to ${action} (${ROLES[i + 1]} can)`);
      }
    }
  });

  test('owner can do everything', () => {
    assert.deepEqual(permissionsFor('owner'), ACTION_NAMES);
  });

  test('owner is never assignable', () => {
    assert.equal(ASSIGNABLE_ROLES.includes('owner'), false);
    assert.deepEqual(ASSIGNABLE_ROLES, ['admin', 'manager', 'member', 'guest']);
  });

  test('guest is read-only plus comments and messages', () => {
    for (const action of ['workspace:read', 'member:read', 'project:read', 'task:read', 'comment:create', 'message:create']) {
      assert.equal(can('guest', action), true, `guest should ${action}`);
    }
    for (const action of [
      'workspace:update', 'workspace:delete', 'member:invite', 'member:update', 'member:remove',
      'project:create', 'project:update', 'project:delete', 'task:create', 'task:update',
      'task:assign', 'task:delete', 'comment:delete_any', 'message:delete_any',
    ]) {
      assert.equal(can('guest', action), false, `guest should not ${action}`);
    }
  });

  test('member works on tasks but cannot create projects or manage people', () => {
    assert.equal(can('member', 'task:create'), true);
    assert.equal(can('member', 'task:update'), true);
    assert.equal(can('member', 'task:delete'), false);
    assert.equal(can('member', 'project:create'), false);
    assert.equal(can('member', 'member:invite'), false);
  });

  test('manager runs projects but cannot manage workspace members', () => {
    assert.equal(can('manager', 'project:create'), true);
    assert.equal(can('manager', 'project:update'), true);
    assert.equal(can('manager', 'project:delete'), false);
    assert.equal(can('manager', 'task:delete'), true);
    assert.equal(can('manager', 'member:invite'), false);
    assert.equal(can('manager', 'workspace:update'), false);
  });

  test('admin cannot delete the workspace; only owner can', () => {
    assert.equal(can('admin', 'workspace:update'), true);
    assert.equal(can('admin', 'workspace:delete'), false);
    assert.equal(can('owner', 'workspace:delete'), true);
  });

  test('unknown roles, actions and prototype keys are denied', () => {
    assert.equal(can('superuser', 'task:read'), false);
    assert.equal(can(undefined, 'task:read'), false);
    assert.equal(can('owner', 'does:not:exist'), false);
    assert.equal(can('owner', 'constructor'), false);
    assert.equal(can('owner', '__proto__'), false);
    assert.deepEqual(permissionsFor('superuser'), []);
  });

  test('outranks is strict and ignores unknown roles', () => {
    assert.equal(outranks('owner', 'admin'), true);
    assert.equal(outranks('admin', 'manager'), true);
    assert.equal(outranks('manager', 'member'), true);
    assert.equal(outranks('member', 'guest'), true);
    assert.equal(outranks('admin', 'admin'), false);
    assert.equal(outranks('member', 'manager'), false);
    assert.equal(outranks('guest', 'superuser'), false);
    assert.equal(outranks('superuser', 'guest'), false);
  });

  test('canModify combines "any" and "own" permissions', () => {
    // Everyone may delete their own comment
    assert.equal(canModify('guest', 'comment:delete', true), true);
    // Only managers and above may delete other people's
    assert.equal(canModify('guest', 'comment:delete', false), false);
    assert.equal(canModify('member', 'comment:delete', false), false);
    assert.equal(canModify('manager', 'comment:delete', false), true);
    // Messages: managers cannot delete others', admins can
    assert.equal(canModify('manager', 'message:delete', false), false);
    assert.equal(canModify('admin', 'message:delete', false), true);
    // Editing is own-only for everyone
    assert.equal(canModify('owner', 'comment:edit', false), false);
    assert.equal(canModify('member', 'comment:edit', true), true);
  });

  test('only guests are scoped to assigned projects', () => {
    assert.equal(isProjectScoped('guest'), true);
    for (const role of ['owner', 'admin', 'manager', 'member']) assert.equal(isProjectScoped(role), false);
  });
});