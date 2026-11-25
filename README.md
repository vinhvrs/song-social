# Song Social

**Mạng xã hội bắt đầu từ một bài nhạc.**

Chia sẻ bài hát cùng câu chuyện của bạn, khám phá gu nhạc của người khác, theo dõi, bình luận và lưu lại những bài đăng muốn nghe lần nữa. Song Social phát triển từ ý tưởng âm nhạc của CatWave và trải nghiệm xã hội của VibeTalk; đây là codebase mới.

Điểm khác biệt được thiết kế xuyên suốt sản phẩm: **câu bạn viết → đoạn lời thực sự được hát trong một bản thu → nghe thử → chọn và chia sẻ**. Đơn vị tìm kiếm là đoạn lời có thời gian bắt đầu/kết thúc, không phải chỉ một bài hát có cùng tâm trạng.

> **Trạng thái: v0.1, bản đầu để phát triển và đánh giá.** Luồng xã hội có backend và PostgreSQL thực. Catalog production hiện có **0 đoạn lời được kiểm duyệt**; hệ thống trả về không có kết quả cho đến khi nhập dữ liệu có nguồn và được nghe kiểm tra. Bản xem trước web khi chưa kết nối backend được ghi rõ **chỉ đọc**, không giả lập lưu thành công.

## Stack

| Phần | Công nghệ |
| --- | --- |
| Web | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| API | Java 21, Spring Boot 3.5, Spring Security, Spring Data JPA |
| Dữ liệu | PostgreSQL 17+, Flyway migrations, Spring Session JDBC |
| Catalog | Python 3.12+, thư viện chuẩn; JSON validation và SQL import |
| Media | YouTube IFrame API, player hiển thị và nguồn video rõ ràng |
| Chạy và kiểm tra | Docker Compose, Maven, npm, GitHub Actions |

Các phiên bản package chính được pin trong `package-lock.json` và Maven parent. Chưa thêm microservices, Kafka, vector database hoặc dịch vụ Python chạy thường trực.

## Đã có trong v0.1

- Đăng ký, đăng nhập, đăng xuất; mật khẩu BCrypt, session cookie HttpOnly và kiểm tra CSRF.
- Feed khám phá và feed người đang theo dõi; phân trang bằng cursor.
- Đăng bài có caption và bài nhạc; xóa bài của chính mình.
- Thích/bỏ thích, bình luận, lưu/bỏ lưu vào thư viện riêng.
- Hồ sơ, sửa tên/tiểu sử, theo dõi/bỏ theo dõi.
- Tìm bài trong catalog nhỏ; phát bằng player YouTube hiển thị.
- Tìm **toàn bộ đoạn lời trùng khớp sau chuẩn hóa** trong catalog đã duyệt; xem lời/timestamp, nghe thử rồi chọn vào bài đăng.
- Công cụ kiểm tra và nhập catalog có nguồn lời, quyền sử dụng, bản thu, người duyệt và xác nhận nghe thử.
- Giao diện responsive, trạng thái tải/lỗi/rỗng và chế độ xem mẫu chỉ đọc khi chưa cấu hình backend.

Các tài khoản/bài đăng `_demo` là dữ liệu minh họa; tài khoản demo không thể đăng nhập. Không có lượt tương tác hoặc số người dùng được tạo để giả vờ có cộng đồng thật.

## Chạy toàn bộ ứng dụng bằng Docker

Cần Docker Engine và Docker Compose.

```sh
cp .env.example .env
# Sửa POSTGRES_PASSWORD trong .env trước khi chạy.
docker compose up --build
```

Mở **http://localhost:3000**. Chỉ web được xuất ra loopback; API và database ở mạng nội bộ Docker. Dữ liệu nằm trong volume `postgres_data` và giữ lại khi khởi động lại. Đổi `WEB_PORT` nếu cổng 3000 đã được dùng.

```sh
docker compose down
# Chỉ dùng khi muốn XÓA toàn bộ dữ liệu local:
# docker compose down --volumes
```

Các biến trong `.env.example` dành cho local HTTP. Khi đưa lên môi trường HTTPS, đặt `SESSION_COOKIE_SECURE=true`, dùng mật khẩu database riêng và cấu hình reverse proxy/origin theo nơi triển khai. Không đưa secret vào biến `NEXT_PUBLIC_*`.

## Phát triển từng phần

Cần Java 21, Maven 3.9+, Node.js 24, PostgreSQL 17+ và Python 3.12+.

### API

Tạo database `song_social`, đặt biến kết nối rồi chạy:

```sh
export DATABASE_URL=jdbc:postgresql://localhost:5432/song_social
export DATABASE_USERNAME=song_social
# Cấp DATABASE_PASSWORD từ môi trường local; không commit mật khẩu.
mvn -f apps/api/pom.xml spring-boot:run
```

API mặc định ở cổng **8080**. Flyway tạo schema; `SEED_DEMO=false` tắt seeding tài khoản/bài viết mẫu. Session cũng nằm trong PostgreSQL, không phụ thuộc bộ nhớ một process.

### Web

```sh
cd apps/web
cp .env.example .env.local
npm ci
npm run dev
```

`BACKEND_URL=http://127.0.0.1:8080` chỉ được đọc ở server Next.js. Browser gọi `/api/v1` trên cùng origin; Route Handler chuyển tiếp cookie/CSRF tới Java. Không cần CORS mở rộng hoặc token đăng nhập trong localStorage.

Khi thiếu `BACKEND_URL` hoặc API không sẵn sàng, web thông báo chế độ chỉ đọc và hiển thị bài mẫu. Những thao tác cần tài khoản không được ghi giả vào localStorage.

### Kiểm thử

```sh
mvn -B -f apps/api/pom.xml verify
npm --prefix apps/web ci
npm --prefix apps/web test
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
python -m unittest discover -s tools/catalog/tests -v
python tools/catalog/catalog.py validate tools/catalog/catalog.empty.json
```

Khi API đang chạy trên **database local dùng để kiểm thử**:

```sh
python scripts/smoke-api.py
```

Smoke test tạo hai tài khoản tạm, kiểm tra HTTP/CSRF/session, quyền xóa, bình luận, idempotency của lượt thích, quyền riêng tư thư viện, follow/feed, hồ sơ và không trả về đoạn lời bịa. Nó xóa bài test nhưng giữ hai tài khoản trong database test. Không chạy trên dữ liệu production. CI chạy cùng luồng này với PostgreSQL thật.

## Catalog: đúng câu, đúng bản thu

Ví dụ `anh nhớ em` không được tự coi là `em nhớ anh`; `I love you` không được khớp với `I don't love you`. v0.1 chỉ chuẩn hóa Unicode NFC, chữ thường và khoảng trắng, rồi đối chiếu **toàn bộ đoạn**. Không bỏ dấu tiếng Việt, dấu câu, đại từ hoặc phủ định; không dùng fuzzy/vector search để tự quyết định ý nghĩa.

Một passage được công bố phải gắn với:

- Lời thực nghe được, ID bài/bản thu và nguồn lời.
- `startMs`, `endMs`, độ dài bản thu và nguồn quyền sử dụng.
- Người/thời gian duyệt và xác nhận đã kiểm tra lời, ranh giới, phát thử.

Validator kiểm tra cấu trúc và yêu cầu bằng chứng; nó **không thể tự chứng nhận** rằng một người đã nghe đúng hay quyền sử dụng là hợp lệ. Dữ liệu phải được con người kiểm tra. Bản nháp trong repo không được gắn timestamp giả và không thể nhập như dữ liệu đã duyệt.

```sh
python tools/catalog/catalog.py validate tools/catalog/examples/draft.json --allow-drafts
python tools/catalog/catalog.py build-sql catalog-private/reviewed.json --output catalog-private/import.sql
# Nhập vào database đã chạy migrations bằng psql / kết nối được quản lý của bạn.
```

Xem [hướng dẫn catalog](docs/catalog.md). Import chỉ thêm bản ghi; không thay thế âm thầm đoạn nhạc đã được dùng trong bài đăng.

YouTube không cung cấp API công khai biến một câu chat bất kỳ thành lời hát kèm timestamp. Player nhúng cũng không bảo đảm cắt chính xác từng từ; người dùng cần nghe thử và xác nhận. Ứng dụng không tải, tách audio hoặc giấu video để giả thành trình phát audio riêng. Nguồn tham khảo: [IFrame API](https://developers.google.com/youtube/iframe_api_reference), [Captions download permissions](https://developers.google.com/youtube/v3/docs/captions/download), [Developer policies](https://developers.google.com/youtube/terms/developer-policies).

## Cấu trúc repo

| Đường dẫn | Nội dung |
| --- | --- |
| `apps/web` | Giao diện Next.js, player, API proxy cùng origin |
| `apps/api` | Spring Boot, domain/service, bảo mật, migrations và tests |
| `tools/catalog` | Validator/importer Python, schema, draft và tests |
| `scripts/smoke-api.py` | Kiểm tra API thực với database local |
| `docs/api-contract.md` | Hợp đồng API dùng chung |
| `docs/catalog.md` | Quy trình nhập và duyệt lời hát |
| `.github/workflows/ci.yml` | Build, tests, PostgreSQL smoke và catalog validation |

## Triển khai

Web có thể deploy từ `apps/web` lên Vercel; Java có Dockerfile riêng và cần PostgreSQL bền vững. Chỉ khi `BACKEND_URL` trỏ tới API hoạt động thì môi trường web đó mới dùng được tài khoản và dữ liệu chung. Không đưa mật khẩu database vào frontend.

Xem [hướng dẫn triển khai](docs/deployment.md) để phân biệt web preview, môi trường full stack và những việc cần làm trước khi mở đăng ký công khai.

## Tiếp theo

- Chuẩn bị một catalog lời hát nhỏ với quyền sử dụng và ranh giới đã nghe kiểm tra.
- Mở rộng thẻ đoạn nhạc sang bình luận và tin nhắn; thêm DM và realtime khi các luồng dữ liệu/riêng tư được kiểm thử.
- Playlist, thông báo, báo cáo/chặn nội dung, khôi phục mật khẩu và xác minh email.
- Tìm đoạn gần nghĩa với bước đối chiếu đại từ/phủ định và xác nhận rõ của người gửi.
- Tìm bài qua YouTube Data API khi có key; hiện tại danh mục bài là catalog được quản lý.

Chưa có các tính năng trên trong v0.1. Tên repo `song-social` được chủ repo chọn ngày **25/11/2026**.
