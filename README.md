# PokeAdventure · 두근두근 모험

부모님과 함께 사용하는 어린이 학습·탐험 게임입니다. 덧셈과 뺄셈, 한글, 영어, 창의력 문제를 풀고 친구를 모읍니다.

[게임 열기](https://pokemon-quiz-bay.vercel.app/)

- 부모가 기기에서 처음 한 번 수첩 이름과 숫자4자리 비밀번호를 정합니다. 게임을 새로 열거나 배경으로 보냈다가 돌아오면 다시 잠깁니다.
- 게임 기록은 해당 기기의 localStorage에만 남습니다. 같은 주소·같은 이름으로 다른 기기에서 열어도 자동 공유되지 않습니다.
- 설정에서 JSON 백업을 내려받아 다른 기기에서 복원할 수 있습니다. 백업에는 진행만 담고 이름·비밀번호·확인값은 담지 않습니다.
- 아이폰·아이패드는 Safari의 공유 → 홈 화면에 추가로 앱처럼 사용할 수 있습니다. 처음 받는 화면·그림·소리에는 인터넷이 필요합니다.

기존 버전의 기기 캐시가 있다면 처음 수첩을 만들 때 이전과 같은 이름을 사용하세요. 부모 비밀번호는 이 기기에서 새로 정합니다. 브라우저 데이터 삭제·기기 분실에 대비해 백업을 보관하세요. 앱 안 부모 잠금은 기기 자체 잠금이나 스크린 타임을 대신하지 않습니다.

## 제안과 기여

[기능 제안·오류 제보](https://github.com/semi0x3b/PokeAdventure/issues/new/choose)는 부모가 작성하는 공개 공간입니다. 아이 이름·얼굴·연락처·비밀번호·백업 파일을 올리지 마세요. 게임 기록은 자동 첨부하지 않습니다. 보안 문제는 [비공개 신고](https://github.com/semi0x3b/PokeAdventure/security/advisories/new)로 받습니다.

화면을 바꾸는 PR에는 같은 조건의 **전후 이미지가 필수**입니다. [기여 안내](CONTRIBUTING.md)와 [PR 템플릿](.github/PULL_REQUEST_TEMPLATE.md)을 확인하세요.

## 개발

Node.js 22 이상에서 별도 패키지 설치 없이 실행합니다.

```sh
npm start
npm test
npm run build
```

`npm start` 뒤 터미널의 로컬 주소를 엽니다. Vercel은 `npm run build`의 `dist`를 배포합니다. 서버 계정이나 데이터베이스 설정은 필요하지 않으며 옛 `/api/game` 요청은410으로 종료합니다.

## 자료·권리

비공식·비상업 팬 프로젝트이며 Nintendo, Creatures, GAME FREAK, The Pokémon Company의 공식 제품·승인·제휴를 주장하지 않습니다. 캐릭터·이름·그림·울음소리의 권리는 각 권리자에게 있습니다. API 제공이나 무료 공개는 별도 사용 허가를 뜻하지 않습니다.

포켓몬 원작 그림·시트·울음소리 파일은 저장소와 배포물에 포함하지 않고 [PokeAPI](https://pokeapi.co/), [SpriteCollab](https://github.com/PMDCollab/SpriteCollab) 등 원본 자료원에서 실행 중 불러옵니다. Safari의 OGG 미지원 때는 PokeAPI로 종 이름을 확인하고 Pokémon Showdown MP3를 사용합니다. 이름·타입·능력치와 시트 프레임 등의 게임용 metadata는 JS로 포함되어 있습니다.

- 문제 그림: ARASAAC, Sergio Palao / Gobierno de Aragón, CC BY-NC-SA 4.0. 상업 사용을 허용하는 자료가 아닙니다.
- 필드·마당 타일과 음악: Ninja Adventure, Pixel-boy / AAA, CC0. 관련 폴더의 LICENSE 참조.
- 학습 글꼴: Nanum Gothic·Andika, SIL OFL1.1. `img/fonts/`의 라이선스 참조.
- 동행 도트의 개별 작가·원본 조건: `docs/field-sprites/`. 공개 원본의 라이선스 미지정 표기를 자유 사용으로 바꾸어 설명하지 않습니다.

MIT는 직접 작성한 코드에만 적용하며 제삼자의 캐릭터·상표·음원·그림·폰트·데이터 권리를 부여하지 않습니다. 게임 설정의 그림·소리 출처, [보관 안내](privacy.html), [이용 조건](terms.html)도 확인하세요.

실제 iPad Safari의 홈 화면 설치·손가락 입력·외부 울음소리 재생은 기기에서 추가 확인이 필요합니다. 구글 계정 연결과 여러 테마 마당은 후속 기획이며 현재 기능으로 표시하지 않습니다.
