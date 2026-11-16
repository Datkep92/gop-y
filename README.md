# Góp ý · CNTaxTools

Trang lấy ý kiến về phương án duy trì CNTaxTools. Mã nguồn độc lập, công khai. Không phải trang đăng ký thanh toán.

## Thành phần

- `public/`: HTML/CSS/JavaScript thuần, được GitHub Pages phát hành từ nhánh `main`, thư mục `/public` qua GitHub Actions.
- `worker/index.js`: API Cloudflare Worker riêng, không dùng Worker thanh toán CNTaxTools.
- `migrations/`: cấu trúc D1 riêng. Không có dữ liệu thật trong repo.
- `tests/`: kiểm đầu vào, giới hạn quyền đọc và lỗi.

## Hành vi

Gửi một phiếu mỗi mã trình duyệt; sửa/rút phiếu bằng mã ngẫu nhiên 256 bit lưu trên trình duyệt. Người xem khác không nhận mã này. Nội dung công khai chỉ có số lượng MST theo khoảng, chủ đề, ý kiến, lựa chọn, thời gian, mã ý kiến ngẫu nhiên và số đồng tình. Không yêu cầu tên, email, số điện thoại hoặc đăng nhập.

Cập nhật bằng cách đọc lại mỗi 15 giây khi trang đang mở. Danh sách dùng cache nội bộ 10 giây ở mỗi điểm phục vụ để giảm đọc D1; quyền sở hữu và mã băm không được đưa vào dữ liệu công khai. Thay đổi từ người khác hiện nút thông báo; không làm nhảy nội dung đang đọc. Mất mạng giữ bản đã đọc và nội dung nháp. Gửi chỉ báo thành công sau khi API xác nhận lưu D1. Xuất CSV có chặn công thức bảng tính.

## Giới hạn cần hiểu

- Mã trình duyệt không xác minh một người thật. Xóa dữ liệu hoặc dùng trình duyệt mới có thể tạo phiếu mới và làm mất quyền sửa phiếu cũ. Không hứa 400 phiếu là 400 người duy nhất.
- Ẩn danh với người xem không đồng nghĩa ẩn danh tuyệt đối: Cloudflare xử lý kết nối mạng; backend giữ mã băm của mã trình duyệt, và bộ đếm chống gửi rác theo mã băm IP/giờ. Không lưu IP rõ trong D1, không bật log truy cập của Worker trong cấu hình.
- Giới hạn 60 lần ghi/giờ/mạng, tối đa 1.000 phiếu. Người dùng chung mạng có thể chạm giới hạn. Đây là chống lạm dụng cơ bản, chưa có CAPTCHA hay chứng thực danh sách 400 người. Nguồn truy cập được kiểm nhưng không thay thế xác thực chống bot.
- Không có bình luận lồng nhau hay trang quản trị web trong bản đầu. Chủ sở hữu quản lý D1 bằng tài khoản Cloudflare. Không có chức năng xóa phiếu người khác ở phía trình duyệt.
- Bộ lọc email/số/link chỉ là hàng rào ban đầu, không bảo đảm chặn mọi thông tin nhận dạng. Báo cáo qua GitHub Issues: chỉ gửi mã ý kiến, tuyệt đối không chép dữ liệu riêng tư.
- Kết quả là ý kiến tự nguyện, không phải cam kết mua hàng. Không có dữ liệu mẫu trộn vào ý kiến thật.

## Phát triển và phát hành

Yêu cầu Node.js 22+, GitHub CLI đã đăng nhập, Wrangler CLI đã đăng nhập Cloudflare (quyền Workers/D1). Không cần thư viện cho web.

```powershell
npm test
npm run check
wrangler d1 migrations apply gop-y-feedback --local
wrangler dev --port 18787 --inspector-port 19349
```

Phục vụ `public/` bằng `node tools/serve.mjs` ở `http://127.0.0.1:4173`. Để thử API local mà không sửa file production, đặt biến môi trường `GOP_Y_LOCAL_API=http://127.0.0.1:18787` trước khi chạy server. Cấu hình hiện tại cho phép origin local 4173 và origin GitHub Pages. Không đưa bí mật vào config.js. Chạy `node tools/check-api.mjs` khi API local sẵn sàng để kiểm gửi/sửa/rút và chống trùng bằng dữ liệu thử riêng.

```powershell
wrangler d1 migrations apply gop-y-feedback --remote
wrangler deploy
```

Đặt địa chỉ API được trả về vào `public/config.js`, kiểm lại, commit các đường dẫn cụ thể rồi push `main`. GitHub Actions chỉ tải `public/` lên Pages; mã Worker và tài liệu không nằm trong thư mục web, dù mã nguồn repository là công khai theo yêu cầu.

### Xử lý một nội dung vi phạm

Chỉ xử lý gửi rác, công kích hoặc lộ thông tin riêng tư; giữ nguyên ý kiến phản đối thu phí. Chủ sở hữu kiểm ID đầy đủ trong Cloudflare D1 console, xóa reactions tương ứng và feedback trong cùng giao dịch. Không công khai nội dung riêng tư khi báo cáo. Không xóa database hay chạy lệnh hàng loạt.
