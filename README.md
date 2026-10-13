# GeoMarketing Studio — Vietflexmap

**Demo WebGIS mã nguồn mở về không gian kinh doanh**, dựa trên nhóm yêu cầu nghiệp vụ của báo cáo *Ứng dụng công nghệ GIS để quản lý quy hoạch và phát triển hệ thống kinh doanh trên địa bàn tỉnh Bến Tre* (báo cáo tổng kết tháng 07/2020, ThS. Lưu Đình Hiệp / Trung tâm Công nghệ Thông tin Địa lý, phối hợp Sở Công Thương Bến Tre).

> **Lưu ý:** Đây là bản xây dựng độc lập, **không phải bản sao/chuyển đổi mã nguồn** của hệ thống ArcGIS trong đề tài. Mọi điểm và vùng trong chế độ demo đều **được tạo giả định bằng thuật toán**, không đại diện cơ sở kinh doanh thật, không phải ranh giới hành chính hoặc dữ liệu cấp phép. Dự án không mang quyền sử dụng dữ liệu gốc chưa được cấp phép.

## Truy cập / chạy

GitHub Pages: `https://base27-cvnss.github.io/Geomarketing/` (**sau khi bật Pages** cho branch `main`, thư mục `/ (root)`).

Chạy tại máy:

```bash
python -m http.server 8080
# Mở http://localhost:8080/
```

Không cần build, backend hoặc khóa API. Bản đồ nền dùng MapLibre GL JS và OpenFreeMap từ Internet; muốn triển khai *hoàn toàn offline* cần lưu thư viện và cung cấp bộ tile/style nội bộ hợp lệ. Các phép tính dùng trực tiếp trong browser.

## Tính năng v0.1

- Phân lớp cơ sở kinh doanh (Point), chợ (Point), vùng nhu cầu (Polygon/MultiPolygon), ứng viên kinh doanh (Point) và vùng phục vụ (buffer địa lý).
- Thống kê cơ bản, tìm kiếm địa điểm, popup, zoom-to-data, phối cảnh 2D/3D, bật/tắt lớp.
- Nhấp bản đồ đặt vị trí mới; lựa chọn bán kính 1–20 km, ngành hàng, hệ số suy giảm β và sức hút A.
- Phân tích khoảng cách chim bay tới đối thủ (haversine), số đối thủ trong vùng, dân số mô phỏng gần đó, xác suất lựa chọn theo Huff.
- Nhập CSV / GeoJSON, kéo-thả, xuất CSV / GeoJSON / JSON kết quả phân tích.
- Giao diện desktop/mobile, tách biệt dữ liệu demo, logic phân tích và trình bày; test thuần Node.

## Chuẩn dữ liệu để đổ dữ liệu thật

**Tọa độ WGS84 EPSG:4326.** GeoJSON `coordinates` phải theo thứ tự `[longitude, latitude]`; CSV có tiêu đề như `data/du-lieu-mau.csv`. Thêm tệp `.csv`, `.geojson` hoặc `.json` từ giao diện:

| Lớp | Kiểu hình học | Trường dữ liệu đề nghị |
|---|---|---|
| Cơ sở kinh doanh | Point | `id`, `name`, `kind: business`, `category`, `address`, `attractiveness` |
| Chợ | Point | `id`, `name`, `kind: market`, `category`, `address`, `attractiveness` |
| Vùng dân số/sức mua | Polygon / MultiPolygon | `id`, `name`, `population`, `income_index` |

Alias: `ten`, `ten_co_so`, `ma_so`, `nganh_nghe`, `dia_chi`, `dan_so`, `chi_so_suc_mua`, `kinh_do`, `vi_do`, `latitude`, `longitude`.

**Chú ý về CSV**: có thể nhập điểm CSV, không thể nhập polygon CSV. Các bản ghi thiếu tọa độ hợp lệ bị bỏ qua. Lần nhập đầu tiên xóa dữ liệu mô phỏng, các lần sau bổ sung dữ liệu mới. Không có cơ sở dữ liệu server, không lưu dữ liệu qua phiên trình duyệt; giữ dữ liệu gốc của bạn ở nguồn quản lý riêng.

**VN-2000:** phải chuyển đổi bằng QGIS/GDAL sang EPSG:4326 theo đúng thông số hệ chiếu nguồn *trước* khi tải lên. Không tự gán EPSG:4326 cho dữ liệu mét, tránh lệch vị trí.

## Huff model (mô hình minh họa)

Với vùng nhu cầu `i`, ứng viên/cửa hàng `j`, giả thiết mức hấp dẫn `A_j` và khoảng cách `d_ij`:

`P_ij = (A_j / max(d_ij,0.2)^β) / Σ_k(A_k / max(d_ik,0.2)^β)`

Huff được chuẩn hóa qua cửa hàng ứng viên và các điểm đối thủ **trong giới hạn 2 × bán kính**; chỉ tính nhu cầu từ polygon có tâm trong bán kính đã chọn. Trọng số vùng = `population × income_index`. Tỷ lệ Huff hiển thị là trung bình xác suất có trọng số. Không suy ra doanh thu/chi phí/lợi nhuận thực tế.

`score = 0.50 × min(100, weightedDemand/600) + 0.25 × 100/(1 + competitors/2) + 0.25 × (HuffShare × 100)`

**Đây là thang điểm thử nghiệm do bản demo tự thiết kế; không phải kết quả mô hình/chuẩn đánh giá của báo cáo nguồn.** Các tham số có thể điều chỉnh khi có dữ liệu thật, nhu cầu thị trường và hiệu chuẩn thống kê. Distance là chim bay, không phải khoảng cách theo mạng đường hay thời gian đi lại; do đó không kết luận được điều kiện cấp phép, vùng bán kính an toàn theo pháp luật, quyền sử dụng đất, quy hoạch hoặc đầu tư.

## Kiến trúc

```text
index.html                  # UI/DOM
src/styles.css              # responsive styling
src/app.js                  # controller, MapLibre, import, export, map layers
src/geo.js                  # pure geometry, CSV parser, Huff calculation
src/demo.js                 # deterministic synthetic features
src/geo.test.js             # (in tests/) unit tests
/tests/geo.test.js
/data/du-lieu-mau.csv       # import template
package.json                # npm test
```

## Phân biệt yêu cầu nguồn và phần phát triển mới

**Kế thừa khái niệm nghiệp vụ từ báo cáo 2020:** quản lý cơ sở kinh doanh, chợ, dữ liệu GIS nền/chuyên đề, tra cứu và thống kê, liên quan tới tọa độ cập nhật thực địa và đánh giá khoảng cách; báo cáo cũng tổng quan nghiên cứu dùng Huff trong chọn địa điểm kinh doanh. **Phần bổ sung của demo này:** giao diện MapLibre mới, dữ liệu ngẫu nhiên sinh theo seed, chỉ số Huff trên vùng nhu cầu giả lập, nhập/xuất trên browser, phân lớp và bộ test. Không suy diễn các hàm cấp phép nghiệp vụ cũ là đang hoạt động.

## Hạn chế và kế hoạch nâng cấp

- V0.1 giới hạn 50k feature/tệp; với dữ liệu lớn chuyển qua PMTiles/MVT, PostGIS và truy vấn server.
- Không có đăng nhập, phân quyền, audit, cập nhật nhiều người, WMS/WFS, dữ liệu nền VN2000, phân tích network/isochrone, tích hợp giấy phép.
- Ứng dụng frontend thuần không nên nhập dữ liệu nhạy cảm/riêng tư khi dùng máy chia sẻ; hiện tại dữ liệu được xử lý cục bộ, không upload qua mã ứng dụng.
- Môi trường thật cần xác thực nguồn, kiểm soát quyền khai thác, kiểm thử CRS và QC topo trước khi phân tích.

## Kiểm thử

```bash
npm test
```

**Long Ngo · Vietflexmap · 2026 · MIT License**