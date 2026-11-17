# 따라 쓰기용 실제 글꼴

- 한글: [Nanum Gothic Regular](https://github.com/google/fonts/tree/main/ofl/nanumgothic), NHN/Naver, SIL Open Font License 1.1. `NanumGothic-OFL.txt`.
- 영어: [Andika Regular](https://github.com/google/fonts/tree/main/ofl/andika), SIL International, SIL Open Font License 1.1. `Andika-OFL.txt`. 읽기 학습용 한 층 a·g를 사용한다.
- `adventure-practice-korean.woff`·`adventure-practice-latin.woff`는 실제 게임 문자를 남긴 묶음이다. Reserved Font Name과 혼동되지 않도록 내부 글꼴 이름을 `Adventure Practice Korean`·`Adventure Practice Latin`으로 바꿨다. 원본 윤곽의 좌표·모양은 수정하지 않았다.
- 출처 원본 SHA-256·지원 문자·정규화 배율은 `manifest.json`. 원본 TTF를 `.data/font-work/originals/`에 두고 이 컴퓨터에 이미 있는 Python/Pillow/NumPy로 `tools/build-tracing-font.py`를 실행하면 다시 만든다. 설치 단계는 없다.
- 화면은 시스템 글꼴로 대체하지 않는다. TTF의 실제 윤곽을 `js/data/strokes-font.js`에 추출해 Path2D로 그린다. 같은 윤곽 안에서 뽑은 중심선을 획 안내·손가락 추적에 쓰므로 기기별 시스템 글꼴이 바뀌어도 안내 위치가 어긋나지 않는다.
- 글꼴 이외의 화면 UI 서체는 바꾸지 않는다.
