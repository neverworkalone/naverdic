# Stage 2 아키텍처와 호환성 계약

상태: TASK 1 확정안

이 문서는 Stage 2의 설정 화면, 설정 저장, 번역 제공자, v6.6 업데이트 경로가
공통으로 따라야 할 계약입니다. TASK 1에서는 기존 화면과 content script 동작을
대규모로 변경하지 않고, 다음 TASK가 사용할 구조만 고정합니다.

## 1. 경계와 책임

```text
Settings UI draft
        │  (명시적 저장 전까지 메모리 상태)
        ▼
v2 settings normalizer ───────► sync: naverdic.settings.v2
        │
        ├─ provider registry ───► preset/custom provider definition
        │
        └─ secret reference ────► local: naverdic.secrets.v2

v6.6 flat sync keys ──read/normalize/transform──► v2 settings + local secrets
```

- `src/settings.mjs`는 TASK 3 마이그레이션이 끝날 때까지 v6.6 평면 저장 계약의
  호환 어댑터로 유지합니다.
- `src/settings-v2.mjs`는 v7 설정 envelope, 메뉴, 기본값, 정규화 규칙의 단일
  계약입니다.
- `src/translation-provider.mjs`는 제공자별 HTTP 차이를 숨길 공통 모델입니다.
  실제 adapter와 네트워크 호출 변경은 TASK 5에서 수행합니다.
- API 키·토큰·Authorization 값은 sync 설정이나 provider definition에 넣지
  않습니다. `auth.secretRef`로 local secrets를 가리킵니다.

## 2. 설정 메뉴와 페이지 구조

메뉴 ID는 번역된 표시 문자열과 분리된 안정적인 계약입니다. 메뉴 이동은 TASK 2,
편집 draft와 저장 상태는 TASK 3에서 구현합니다.

| 순서 | ID | 종류 | 책임 | 비고 |
| ---: | --- | --- | --- | --- |
| 10 | `dictionary` | page | 더블클릭·드래그 사전 검색 | v6.6 `dclick`, `drag` 계열 |
| 20 | `translation` | page | 번역 사용, 제공자, 대상 언어 | v6.6 DeepL 값 승계 |
| 30 | `popup` | page | 배경색·글자색·글자 크기 | v6.6 popup 값 승계 |
| 40 | `sites` | page | 사용 중지 사이트 목록 | v6.6 `safe_urls` 승계 |
| 50 | `advanced` | page | 초기화와 향후 고급 기능 | 초기화는 이 메뉴 아래에만 배치 |
| 90 | `help` | external | 도움말 외부 링크 | 페이지 상태를 만들지 않음 |

표시 문자열은 `labelKey`, `descriptionKey`를 통해 로케일 파일에서 가져옵니다.
코드에는 한국어·영어 문장을 직접 넣지 않습니다.

## 3. v2 설정 저장 계약

Chrome storage 영역과 키는 아래처럼 분리합니다.

| 데이터 | 영역 | 키 | 포함 가능 값 |
| --- | --- | --- | --- |
| 일반 설정 | `chrome.storage.sync` | `naverdic.settings.v2` | 동기화해도 안전한 값만 |
| 인증 정보 | `chrome.storage.local` | `naverdic.secrets.v2` | API 키·토큰 등 비밀 값 |

v2 settings의 기본 envelope는 다음과 같습니다.

```json
{
  "schemaVersion": 2,
  "interface": { "language": "auto" },
  "dictionary": {
    "doubleClick": { "enabled": true, "triggerKey": "none", "speedMs": 400 },
    "drag": { "enabled": true, "triggerKey": "ctrl" }
  },
  "popup": {
    "backgroundColor": "#FFF59D",
    "fontColor": "#000000",
    "fontSizePt": 11
  },
  "sites": { "denyListEnabled": false, "denyList": [] },
  "translation": {
    "enabled": false,
    "triggerKey": "ctrlalt",
    "providerId": "deepl-free",
    "targetLanguage": "ko"
  },
  "customProviders": {}
}
```

`naverdic.secrets.v2`의 기본 형태는 다음과 같습니다.

```json
{
  "schemaVersion": 2,
  "providers": {
    "deepl-free": { "apiKey": "<local-only-secret>" }
  }
}
```

실제 값이 없는 provider의 credential object는 저장하지 않습니다. 설정을 읽거나
저장할 때 모르는 필드는 제거하고, 잘못된 타입은 해당 필드의 기본값으로 보정합니다.
정상적인 사용자가 이미 저장한 값은 이름·기능·의미를 바꾸지 않고 보존합니다.

## 4. v6.6 → v7 변환 규칙

변환 함수는 `src/settings-migration-v2.mjs`의 `migrateV66ToV2`입니다. 입력을
변경하지 않고, v6.6 키를 v2 sync envelope에 그대로 복사하지 않습니다.

| v6.6 sync 키 | v7 대상 | 변환 |
| --- | --- | --- |
| `dclick` | `dictionary.doubleClick.enabled` | boolean 정규화 |
| `dclick_trigger_key` | `dictionary.doubleClick.triggerKey` | `none/ctrl/alt/ctrlalt` |
| `dclick_speed` | `dictionary.doubleClick.speedMs` | 숫자 문자열도 숫자로 변환 |
| `drag` | `dictionary.drag.enabled` | boolean 정규화 |
| `drag_trigger_key` | `dictionary.drag.triggerKey` | trigger 정규화 |
| `translate` | `translation.enabled` | boolean 정규화 |
| `translate_trigger_key` | `translation.triggerKey` | trigger 정규화 |
| `deepl_auth_key` | `secrets.providers.deepl-free.apiKey` | sync에서 제거하고 local로 이동 |
| `popup_bgcolor` | `popup.backgroundColor` | 공백 제거 후 비어 있으면 기본값 |
| `popup_fontcolor` | `popup.fontColor` | 공백 제거 후 비어 있으면 기본값 |
| `popup_fontsize` | `popup.fontSizePt` | 숫자 문자열을 양의 정수로 변환 |
| `use_deny_list` | `sites.denyListEnabled` | boolean 정규화 |
| `safe_urls` | `sites.denyList` | 쉼표·세미콜론·줄바꿈 분리, host 정규화·중복 제거 |

v6.6에는 제공자 ID나 대상 언어 키가 없으므로 각각 `deepl-free`, `ko`를 기본값으로
사용합니다. 이는 현재 v6.6 content script가 사용하는 DeepL Free와 한국어 결과를
그대로 이어가기 위한 호환 규칙입니다.

마이그레이션은 다음 원칙을 지킵니다.

1. 기존 v6.6 키는 읽기 전용으로 취급하고, 변환 중 삭제하지 않습니다.
2. 변환은 여러 번 실행해도 같은 결과가 나오는 멱등 작업이어야 합니다.
3. 변환 중 모르는 sync 키는 건드리지 않습니다.
4. 일반 설정과 비밀 정보의 저장 성공 여부는 각각 확인해야 합니다.
5. TASK 3에서 명시적 저장 흐름과 연결할 때까지 기존 content script는 v6.6
   contract를 계속 읽어 Stage 1 동작을 유지합니다.

## 5. 번역 제공자 공통 모델

`src/translation-provider.mjs`의 provider definition은 다음 필드만 저장합니다.

```json
{
  "modelVersion": 1,
  "id": "custom-example",
  "name": "Custom example",
  "kind": "custom",
  "presetId": null,
  "endpoint": { "url": "https://api.example.com/translate", "method": "POST" },
  "auth": {
    "mode": "bearer",
    "location": "header",
    "headerName": "Authorization",
    "prefix": "Bearer ",
    "secretRef": "providers.custom-example.token"
  },
  "request": {
    "headers": [
      { "name": "Content-Type", "valueTemplate": "application/json" }
    ],
    "bodyTemplate": { "text": ["{{text}}"], "target": "{{targetLanguage}}" },
    "textPath": "text",
    "targetLanguagePath": "target"
  },
  "response": { "textPath": "data.translation" }
}
```

- `request.bodyTemplate`의 `{{text}}`, `{{targetLanguage}}`는 adapter가 채울
  자리표시자입니다.
- `response.textPath`는 정규화할 번역 문자열의 경로입니다.
- `Authorization`, `api-key`, `token`처럼 민감할 수 있는 header/body 필드는
  원문 값을 저장하지 않습니다. 필요한 경우 `secretRef`와 `{{secret}}`
  placeholder로 local secrets를 참조합니다.
- preset은 `deepl-free`, `deepl-pro`를 우선 계약으로 제공하며, Gemini 등 JSON
  구조가 다른 제공자는 TASK 5에서 adapter와 fixture를 검증한 뒤 추가합니다.
- 사용자가 말한 Figma의 “Chrome Translate”는 공개 Chrome Translate API를
  전제로 구현하지 않습니다. TASK 5 전에 Google Translate 연결, 브라우저 번역
  페이지 호출, 별도 API preset 중 하나로 의미를 확정해야 합니다.

## 6. UI 토큰

공통 토큰은 `src/styles/tokens.css`에 있습니다. Figma에서 확인한 핵심 값은
페이지/팝업 표면 `#F5F6F8`, 캔버스 `#E5E5E5`, 설정 테두리 `#DDE3EC`, 팝업
테두리 `#E2E6EC`, 보조 표면 `#E2E8F0`, 흰색 표면 `#FFFFFF`입니다.

레이아웃 기준값은 팝업 내부 간격 8px, 팝업 padding 14px, 설정 컬럼 간격 22px,
설정 페이지 외곽 여백 40px, 팝업 radius 10px, 설정 카드 radius 14px입니다.
입력·버튼·카드는 default/hover/focus/disabled/error/success 상태 토큰을
사용합니다. TASK 2부터 컴포넌트는 이 토큰을 소비하며, 동일한 값을 컴포넌트
스타일에 다시 선언하지 않습니다.

## 7. TASK 1 완료 조건

- v2 설정 envelope와 메뉴 ID가 코드와 문서에 존재합니다.
- provider model이 credential 값과 provider definition을 분리합니다.
- 13개 v6.6 키의 변환 규칙이 코드와 문서에서 일치합니다.
- 기존 `src/settings.mjs`와 Stage 1 content/background 동작은 TASK 1에서
  변경하지 않습니다.
- 기존 테스트 37개는 사용자 작업 트리의 manifest 변경을 제외하면 계속
  통과해야 하며, 새 계약 테스트는 v2 메뉴·schema·provider·migration을
  직접 검증합니다.
