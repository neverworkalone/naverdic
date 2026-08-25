import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDictionaryUrl,
  buildNaverApiUrl,
  normalizeNaverDictionaryEntries,
  parseNaverDictionaryItems,
  parseNaverDictionaryResponse
} from '../src/dictionary/parser.mjs'
import {
  normalizeDictionaryEntry,
  normalizeHttpUrl,
  normalizeMeanings,
  normalizeString,
  normalizeStringList,
  stripInlineMarkup
} from '../src/dictionary/normalizer.mjs'

function response(items) {
  return {
    searchResultMap: {
      searchResultListMap: {
        WORD: { items }
      }
    }
  }
}

test('parses a normal single dictionary result', () => {
  const result = parseNaverDictionaryResponse(response([{
    handleEntry: 'hello',
    meansCollector: [{
      partOfSpeech: '명사',
      means: [
        { order: 1, value: '안녕하세요' },
        { order: 2, value: '여보세요' }
      ]
    }],
    searchPhoneticSymbolList: [{
      symbolValue: 'həˈloʊ',
      symbolFile: 'https://audio.example/hello.mp3'
    }]
  }]))

  assert.deepEqual(result, [{
    word: 'hello',
    dictionaryUrl: 'https://en.dict.naver.com/#/search?query=hello',
    partOfSpeech: '명사',
    phoneticSymbol: 'həˈloʊ',
    audioUrl: 'https://audio.example/hello.mp3',
    meanings: [
      { order: '1', value: '안녕하세요' },
      { order: '2', value: '여보세요' }
    ]
  }])
})

test('keeps parsing and normalization as separate contracts', () => {
  const rawEntries = parseNaverDictionaryItems(response([{
    handleEntry: '  hello  ',
    meansCollector: [{
      partOfSpeech: ' 명사 ',
      means: [{ order: 1, value: ' 안녕하세요 ' }]
    }],
    searchPhoneticSymbolList: [{
      symbolValue: ' həˈloʊ ',
      symbolFile: ' https://audio.example/hello.mp3 '
    }]
  }]))

  assert.deepEqual(rawEntries, [{
    word: '  hello  ',
    partOfSpeech: ' 명사 ',
    meanings: [{ order: 1, value: ' 안녕하세요 ' }],
    phonetics: [{
      phoneticSymbol: ' həˈloʊ ',
      audioUrl: ' https://audio.example/hello.mp3 '
    }]
  }])

  assert.deepEqual(normalizeNaverDictionaryEntries(rawEntries), [{
    word: 'hello',
    dictionaryUrl: 'https://en.dict.naver.com/#/search?query=hello',
    partOfSpeech: '명사',
    phoneticSymbol: 'həˈloʊ',
    audioUrl: 'https://audio.example/hello.mp3',
    meanings: [{ order: '1', value: '안녕하세요' }]
  }])
})

test('keeps multiple dictionary entries and their meanings', () => {
  const result = parseNaverDictionaryResponse(response([
    {
      handleEntry: 'run',
      meansCollector: [{ partOfSpeech: '동사', means: [{ order: 1, value: '달리다' }] }],
      searchPhoneticSymbolList: [{ symbolValue: 'rʌn', symbolFile: 'https://audio.example/run.mp3' }]
    },
    {
      handleEntry: 'run',
      meansCollector: [{ partOfSpeech: '명사', means: [{ order: 1, value: '달리기' }] }],
      searchPhoneticSymbolList: [{ symbolValue: 'rʌn', symbolFile: 'https://audio.example/run-noun.mp3' }]
    }
  ]))

  assert.equal(result.length, 2)
  assert.equal(result[0].partOfSpeech, '동사')
  assert.equal(result[0].meanings[0].value, '달리다')
  assert.equal(result[1].partOfSpeech, '명사')
  assert.equal(result[1].meanings[0].value, '달리기')
})

test('returns an empty list for empty or missing search results', () => {
  assert.deepEqual(parseNaverDictionaryResponse(null), [])
  assert.deepEqual(parseNaverDictionaryResponse(undefined), [])
  assert.deepEqual(parseNaverDictionaryResponse({}), [])
  assert.deepEqual(parseNaverDictionaryResponse({ searchResultMap: {} }), [])
  assert.deepEqual(parseNaverDictionaryResponse(response([])), [])
})

test('does not throw when nested fields are missing', () => {
  assert.doesNotThrow(() => parseNaverDictionaryResponse(response([
    { handleEntry: 'safe' },
    { handleEntry: 'also-safe', meansCollector: undefined },
    { handleEntry: 'still-safe', meansCollector: [{}], searchPhoneticSymbolList: undefined }
  ])))

  assert.deepEqual(parseNaverDictionaryResponse(response([
    { handleEntry: 'safe' },
    { handleEntry: 'also-safe', meansCollector: undefined },
    { handleEntry: 'still-safe', meansCollector: [{}], searchPhoneticSymbolList: undefined }
  ])), [
    {
      word: 'safe',
      dictionaryUrl: 'https://en.dict.naver.com/#/search?query=safe',
      partOfSpeech: '',
      phoneticSymbol: '',
      audioUrl: '',
      meanings: []
    },
    {
      word: 'also-safe',
      dictionaryUrl: 'https://en.dict.naver.com/#/search?query=also-safe',
      partOfSpeech: '',
      phoneticSymbol: '',
      audioUrl: '',
      meanings: []
    },
    {
      word: 'still-safe',
      dictionaryUrl: 'https://en.dict.naver.com/#/search?query=still-safe',
      partOfSpeech: '',
      phoneticSymbol: '',
      audioUrl: '',
      meanings: []
    }
  ])
})

test('finds a later audio entry and keeps its phonetic symbol paired with it', () => {
  const result = parseNaverDictionaryResponse(response([{
    handleEntry: 'audio',
    searchPhoneticSymbolList: [
      { symbolValue: 'wrong-first-symbol' },
      { symbolValue: 'right-symbol', symbolFile: 'https://audio.example/right.mp3' }
    ]
  }]))

  assert.equal(result[0].phoneticSymbol, 'right-symbol')
  assert.equal(result[0].audioUrl, 'https://audio.example/right.mp3')
})

test('strips inline markup from phonetic symbols', () => {
  const result = parseNaverDictionaryResponse(response([{
    handleEntry: 'test',
    searchPhoneticSymbolList: [{
      symbolValue: '<strong>test</strong>',
      symbolFile: 'https://audio.example/test.mp3'
    }]
  }]))

  assert.equal(result[0].phoneticSymbol, 'test')
})

test('does not let missing meanings or invalid audio URLs throw', () => {
  const result = parseNaverDictionaryResponse(response([{
    handleEntry: 'partial',
    meansCollector: [{ partOfSpeech: '형용사' }],
    searchPhoneticSymbolList: [
      { symbolValue: 'bad', symbolFile: 'javascript:alert(1)' },
      { symbolValue: 'also-bad', symbolFile: 'not a url' }
    ]
  }]))

  assert.deepEqual(result[0].meanings, [])
  assert.equal(result[0].phoneticSymbol, '')
  assert.equal(result[0].audioUrl, '')
})

test('normalizes scalar and array values consistently', () => {
  assert.equal(normalizeString(null), '')
  assert.equal(normalizeString(undefined), '')
  assert.equal(normalizeString('  text  '), 'text')
  assert.equal(normalizeString(12), '12')
  assert.equal(normalizeString(false), 'false')
  assert.equal(normalizeString({value: 'text'}), '')

  assert.deepEqual(normalizeStringList(null), [])
  assert.deepEqual(normalizeStringList('text'), [])
  assert.deepEqual(normalizeStringList([' text ', '', null, 12, false, ['nested']]), [
    'text',
    '12',
    'false'
  ])
  assert.equal(
    stripInlineMarkup('(↔<span class="related_word" lang="en">go out</span>)'),
    '(↔go out)'
  )
  assert.equal(stripInlineMarkup('first<br>second'), 'first\nsecond')
  assert.equal(
    stripInlineMarkup('&lt;이미 연결되었거나 쉽게 알 수 있는 사람·사물 앞에 붙음&gt;'),
    '이미 연결되었거나 쉽게 알 수 있는 사람·사물 앞에 붙음'
  )
  assert.equal(stripInlineMarkup('&lt;strong&gt;test&lt;/strong&gt;'), 'test')
  assert.equal(stripInlineMarkup('A &amp; B'), 'A & B')
  assert.equal(stripInlineMarkup('&#x3c;사용법&#x3e;'), '사용법')
})

test('normalizes missing and invalid entry fields to the stable contract', () => {
  assert.deepEqual(normalizeDictionaryEntry({
    word: '  partial ',
    partOfSpeech: null,
    meanings: [
      null,
      { order: 1, value: ' first ' },
      'invalid',
      { order: undefined, value: undefined }
    ],
    phonetics: [
      { phoneticSymbol: 'bad', audioUrl: 'javascript:alert(1)' },
      { phoneticSymbol: 'good', audioUrl: ' https://audio.example/good.mp3 ' }
    ]
  }), {
    word: 'partial',
    partOfSpeech: '',
    phoneticSymbol: 'good',
    audioUrl: 'https://audio.example/good.mp3',
    meanings: [
      { order: '1', value: 'first' },
      { order: '', value: '' }
    ]
  })

  assert.equal(normalizeDictionaryEntry(null), null)
  assert.deepEqual(normalizeMeanings(null), [])
  assert.deepEqual(normalizeMeanings([]), [])
  assert.equal(normalizeHttpUrl(null), '')
  assert.equal(normalizeHttpUrl('data:audio/wav;base64,abc'), '')
})

test('ignores invalid sibling entries while preserving valid response order', () => {
  const result = parseNaverDictionaryResponse(response([
    null,
    'invalid',
    { handleEntry: ' first ', meansCollector: [{ means: [] }] },
    { handleEntry: 'second', meansCollector: undefined }
  ]))

  assert.deepEqual(result.map(entry => entry.word), ['first', 'second'])
  assert.equal(result[0].dictionaryUrl, 'https://en.dict.naver.com/#/search?query=first')
  assert.deepEqual(result[1].meanings, [])
})

test('keeps headwords as text and removes markup from dictionary meanings', () => {
  const word = '<img src=x onerror=alert(1)>'
  const meaning = '<script>alert(1)</script>'
  const result = parseNaverDictionaryResponse(response([{
    handleEntry: word,
    meansCollector: [{ means: [{ order: 1, value: meaning }] }]
  }]))

  assert.equal(result[0].word, word)
  assert.equal(result[0].meanings[0].value, 'alert(1)')
  assert.ok(!result[0].dictionaryUrl.includes('<'))
})

test('removes related-word span markup from the come dictionary response', () => {
  const result = parseNaverDictionaryResponse(response([{
    handleEntry: 'come',
    meansCollector: [{
      partOfSpeech: '동사',
      means: [
        {order: 1, value: '(밀물이) 밀려[들어]오다 (↔<span class="related_word" lang="en">go out</span>)'},
        {order: 2, value: '(경주에서 몇 위로) 들어오다'},
        {order: 3, value: '유행하다 (↔<span class="related_word" lang="en">go out</span>)'}
      ]
    }]
  }]))

  assert.deepEqual(result[0].meanings, [
    {order: '1', value: '(밀물이) 밀려[들어]오다 (↔go out)'},
    {order: '2', value: '(경주에서 몇 위로) 들어오다'},
    {order: '3', value: '유행하다 (↔go out)'}
  ])
})

test('decodes escaped usage delimiters from the the dictionary response', () => {
  const result = parseNaverDictionaryResponse(response([{
    handleEntry: 'the',
    meansCollector: [{
      partOfSpeech: '정관사',
      means: [
        {order: 1, value: '&lt;이미 연결되었거나 쉽게 알 수 있는 사람·사물 앞에 붙음&gt;'},
        {order: 2, value: '&lt;유일한 존재·해당 유형 중 일반적이거나 두드러지는 사람·사물 앞에 붙음&gt;'}
      ]
    }]
  }]))

  assert.deepEqual(result[0].meanings, [
    {order: '1', value: '이미 연결되었거나 쉽게 알 수 있는 사람·사물 앞에 붙음'},
    {order: '2', value: '유일한 존재·해당 유형 중 일반적이거나 두드러지는 사람·사물 앞에 붙음'}
  ])
})

test('encodes API and dictionary query values', () => {
  const query = 'hello world&"'
  const encoded = encodeURIComponent(query)

  assert.equal(buildNaverApiUrl(query), `https://en.dict.naver.com/api3/enko/search?m=mobile&lang=ko&query=${encoded}`)
  assert.equal(buildDictionaryUrl(query), `https://en.dict.naver.com/#/search?query=${encoded}`)
})
