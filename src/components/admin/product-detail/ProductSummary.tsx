import { Card } from "@/components/ui/card";
import ProductLinkCopy from "@/components/common/ProductLinkCopy";

export default function ProductSummary({ product }) {
  if (!product) {
    return <p>상품 정보를 불러오는 중...</p>;
  }

  return (
    <Card className="product-summary" size="sm">
      <p>
        <strong className="product-meta-label">제목:</strong>{" "}
        <span className="product-title-text">{product.title ?? "-"}</span>
      </p>
      <p>
        <strong className="product-meta-label">상품:</strong>{" "}
        <span className="product-product-name-text">{product.product_name ?? "-"}</span>
      </p>
      <div className="product-note-box">
        <strong>비고</strong>
        <p>{product.description ?? "-"}</p>
      </div>
      <div className="product-note-box">
        <strong>링크</strong>
        <ProductLinkCopy value={product.product_link} />
      </div>
    </Card>
  );
}
