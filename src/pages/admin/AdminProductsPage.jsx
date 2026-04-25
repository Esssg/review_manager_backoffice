import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ADMIN_STORAGE_KEY } from "../../constants/admin";
import { fetchAdminProducts } from "../../services/adminProducts";

export default function AdminProductsPage() {
  const adminId = localStorage.getItem(ADMIN_STORAGE_KEY);
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await fetchAdminProducts(adminId);

      if (error) {
        setErrorMessage(error.message);
      } else {
        setProducts(data ?? []);
      }

      setIsLoading(false);
    };

    loadProducts();
  }, [adminId]);

  return (
    <>
      <header className="admin-header">
        <div>
          <h1>상품</h1>
          <p>`products` 테이블 데이터를 표시합니다.</p>
        </div>
      </header>

      <section className="dashboard-panel" aria-label="상품 목록">
        {isLoading && <p className="login-message">상품 데이터를 불러오는 중...</p>}
        {!isLoading && errorMessage && <p className="login-error">{errorMessage}</p>}
        {!isLoading && !errorMessage && (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>제목</th>
                <th>상품명</th>
                <th>담당자</th>
                <th>입금일</th>
                <th>실배송</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7}>등록된 상품이 없습니다.</td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="clickable-row" onClick={() => navigate(`/admin/product/specific/${product.id}`)}>
                    <td>{product.id}</td>
                    <td>{product.title ?? "-"}</td>
                    <td>{product.product_name ?? "-"}</td>
                    <td>{product.manager_id ?? "-"}</td>
                    <td>{product.deposit_date ?? "-"}</td>
                    <td>{product.is_real_shipping ? "Y" : "N"}</td>
                    <td>{product.created_at ? new Date(product.created_at).toLocaleDateString("ko-KR") : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
