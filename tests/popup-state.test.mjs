import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isPopupDataEmpty,
  POPUP_STATES,
  resolvePopupState
} from '../src/popup-state.mjs'

test('shares dictionary and translation state resolution across popup renderers', () => {
  assert.equal(isPopupDataEmpty('dictionary', []), true)
  assert.equal(isPopupDataEmpty('translation', '  '), true)
  assert.equal(isPopupDataEmpty('dictionary', [{word: 'hello'}]), false)
  assert.equal(isPopupDataEmpty('translation', '안녕하세요'), false)

  assert.deepEqual(
    resolvePopupState('dictionary', {status: 'success', data: []}),
    {state: POPUP_STATES.EMPTY, data: [], error: null}
  )
  assert.deepEqual(
    resolvePopupState('translation', {status: 'success', data: 'loaded'}),
    {state: POPUP_STATES.RESULT, data: 'loaded', error: null}
  )
  assert.equal(
    resolvePopupState('dictionary', {status: 'stale'}),
    null
  )
})
