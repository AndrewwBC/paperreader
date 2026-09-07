import test from 'node:test'
import assert from 'node:assert/strict'
import { readNavigation, navigationHref } from '../src/utils/navigation.js'

test('paper and annotation links survive reload, including numeric and escaped IDs', () => {
  const href = navigationHref({ studyId: 'study 1', paperId: 'paper&2', annotationId: 17042, tab: 'highlights' }, 'https://vault.test/')
  assert.deepEqual(readNavigation(new URL(href, 'https://vault.test').search), {
    studyId: 'study 1', paperId: 'paper&2', annotationId: '17042', tab: 'highlights', view: 'editor',
  })
  assert.equal(readNavigation('?paper=paper-id').view, 'editor')
})

test('home and study navigation clear child context and retain unrelated query and auth hash', () => {
  const current = 'https://vault.test/?study=old&paper=p&annotation=a&tab=highlights&filter=x#verify=token'
  assert.equal(navigationHref({}, current), '/?filter=x#verify=token')
  assert.equal(navigationHref({ studyId: 'new' }, current), '/?filter=x&study=new#verify=token')
  assert.equal(readNavigation('?annotation=orphan&tab=unknown').view, 'home')
  assert.equal(readNavigation('?annotation=orphan&tab=unknown').annotationId, null)
})

test('cards and reading panel views preserve explicit context', () => {
  for (const tab of ['reading', 'form', 'json', 'cite', 'highlights']) {
    const href = navigationHref({ studyId: 's', paperId: 'p', tab, view: 'cards' }, 'https://vault.test/')
    const route = readNavigation(new URL(href, 'https://vault.test').search)
    assert.equal(route.tab, tab)
    assert.equal(route.view, 'cards')
    assert.equal(route.paperId, 'p')
  }
})
