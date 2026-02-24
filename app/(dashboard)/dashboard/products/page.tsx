"use client";

import { useEffect, useState } from "react";
import { ProductsClient } from "@/components/dashboard/products-client";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { getProducts } from "@/actions/products";
import type { Product } from "@/types";
import { Loader2 } from "lucide-react";

export default function ProductsPage() {
  const { tenantId, userRole } = useDashboard();
  const [products, setProducts] = useState<Product[] | undefined>(undefined);

  useEffect(() => {
    getProducts().then((p) => setProducts(p || [])).catch(() => setProducts([]));
  }, []);

  if (products === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ProductsClient
      initialProducts={products}
      userRole={userRole}
      tenantId={tenantId}
    />
  );
}
