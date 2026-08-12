import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ADMIN_STORAGE_KEY } from "@/constants/admin";
import { fetchAdminProducts } from "@/services/adminProducts";
import { getLocalStorageValue } from "@/utils/browserStorage";

export default function AdminProductsPage() {
  const adminId = getLocalStorageValue(ADMIN_STORAGE_KEY);
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

      <Card className="dashboard-panel" aria-label="상품 목록">
        {isLoading && <p className="login-message">상품 데이터를 불러오는 중...</p>}
        {!isLoading && errorMessage && <p className="login-error">{errorMessage}</p>}
        {!isLoading && !errorMessage && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>상품명</TableHead>
                <TableHead>담당자</TableHead>
                <TableHead>입금일</TableHead>
                <TableHead>실배송</TableHead>
                <TableHead>생성일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>등록된 상품이 없습니다.</TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product.id} className="clickable-row" onClick={() => navigate(`/admin/product/specific/${product.id}`)}>
                    <TableCell>{product.id}</TableCell>
                    <TableCell>{product.title ?? "-"}</TableCell>
                    <TableCell>{product.product_name ?? "-"}</TableCell>
                    <TableCell>{product.manager_id ?? "-"}</TableCell>
                    <TableCell>{product.deposit_date ?? "-"}</TableCell>
                    <TableCell>{product.is_real_shipping ? "Y" : "N"}</TableCell>
                    <TableCell>{product.created_at ? new Date(product.created_at).toLocaleDateString("ko-KR") : "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
