// 서비스 워커 — **두 번째 방문부터 네트워크를 거의 안 쓴다.**
//
// 왜: AOT 판의 `_framework` 는 무압축 87MB(br 20MB)다. 첫 방문에 그 값을 치르는 것은 어쩔 수
// 없지만, 같은 판을 다시 여는 사람이 매번 다시 받을 이유는 없다 — 판이 그대로면 바이트도
// 그대로이기 때문이다.
//
// 캐시 이름에 **판 ID**가 박힌다 (`20260913-001038-885` = 발행 도구가 박는 자리 ·
// tools/build.ps1 의 -PublishWeb). 새 판이 서면 이름이 갈려 옛 캐시는 activate 에서 통째로
// 걷힌다 — 「새 판인데 옛 엔진이 도는」 갈래가 구조적으로 없다.
//
// **팩(pack.bin)은 손대지 않는다** [설계]: 게으른 자원은 `Range` 로 한 조각씩 오는데, 그것을
// 캐시로 받으려면 54MB 컨테이너를 첫 방문에 통째로 받아야 한다 — 지금 구도(첫 화면에 필요한
// 몫만 받는다)를 정면으로 뒤집는 값이다. 그래서 `Range` 가 붙은 요청과 `pack.bin` 은 그냥
// 흘려보낸다. `pack.json` 은 작고 판마다 고정이라 캐시한다.
const VERSION = '20260913-001038-885';
const CACHE = 'windengine-' + VERSION;

self.addEventListener('install', function (event) {
    // 미리 담지 않는다 — 무엇이 필요한지는 실제 요청이 말한다 (목록을 두 곳에 적지 않는다).
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(names.map(function (name) {
                return name === CACHE ? null : caches.delete(name);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

// 캐시에 담지 않는 것: GET 이 아닌 것 · 다른 출처 · Range 요청 · 팩 컨테이너.
function bypass(request) {
    if (request.method !== 'GET') return true;
    if (request.headers.get('range')) return true;
    var url = new URL(request.url);
    if (url.origin !== self.location.origin) return true;
    return url.pathname.endsWith('/pack.bin');
}

self.addEventListener('fetch', function (event) {
    if (bypass(event.request)) return;   // 손대지 않는다 = 브라우저 기본 동작 그대로.
    event.respondWith(
        caches.open(CACHE).then(function (cache) {
            return cache.match(event.request).then(function (hit) {
                if (hit) return hit;
                return fetch(event.request).then(function (response) {
                    // 부분·오류 응답은 담지 않는다 (담으면 다음 방문이 그 오류를 재생한다).
                    if (response && response.status === 200 && response.type === 'basic') {
                        cache.put(event.request, response.clone());
                    }
                    return response;
                });
            });
        })
    );
});
