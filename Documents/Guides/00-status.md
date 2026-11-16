# Bàn giao dự án gop-y

## 2026-11-17

- Yêu cầu: tạo repo Public `Datkep92/gop-y`, phát hành web tĩnh cho góp ý phương án thu phí CNTaxTools.
- Cơ chế: HTML/CSS/JS trên GitHub Pages; API Cloudflare Worker mới và D1 mới, tách khỏi hệ thống CNTaxTools. Không sửa dự án HoaDonNhe.
- Có form, sửa/rút phiếu, đồng tình, lọc/sắp xếp, phân trang, thống kê, xuất CSV, nháp local, cập nhật mỗi 15 giây. Không yêu cầu dữ liệu nhận dạng.
- Đang kiểm thử và chuẩn bị phát hành. Chưa coi bản chạy thật là đạt khi chưa có kết quả API và Pages.
- Giới hạn: phiếu theo trình duyệt, không xác minh một người; chống gửi rác cơ bản; báo cáo vi phạm cần GitHub; chưa có trang quản trị web.

### Kiểm trước công bố

- Source: 8/8 kiểm đầu vào và quyền truy cập đạt. Kiểm cú pháp JS đạt.
- Local Worker + D1: 13/13 gửi/sửa/rút, riêng quyền chủ phiếu, đồng tình không trùng, lọc thông tin nhận dạng, giới hạn mạng đạt.
- Worker + D1 trên mạng: 12/12 kiểm tương ứng (không bắn thử giới hạn gửi trên mạng). Đã rút toàn bộ phiếu thử; dữ liệu trở về 0 phiếu trước khi chia sẻ trang.
- API: https://gop-y-feedback.linhnhaxac10.workers.dev ; version 94b770d9-0356-4efa-90d6-ef599235e402.
- Khắc phục lỗi chạy local: Wrangler cài đặt hỗ trợ đến 2026-10-08, đã đặt compatibility_date tương ứng; dùng cổng 18787 và inspector 19349 tránh cổng bị Windows chặn.
- Công cụ trình duyệt trả về "Local browser use is disabled in Work settings". Chưa kiểm trực quan hoặc thao tác bằng trình duyệt, chưa đo 400 người đồng thời. Không coi kiểm source/API là bằng chứng browser.
