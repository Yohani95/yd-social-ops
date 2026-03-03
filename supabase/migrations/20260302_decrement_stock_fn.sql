-- Función atómica para decrementar stock de producto.
-- Retorna TRUE si el decremento fue exitoso (había stock suficiente).
-- Retorna FALSE si el stock era insuficiente (no modifica nada).
-- La condición stock >= p_quantity previene overselling a nivel de DB.

CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_id UUID,
  p_tenant_id  UUID,
  p_quantity   INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  rows_affected INT;
BEGIN
  UPDATE products
  SET    stock      = GREATEST(0, stock - p_quantity),
         updated_at = NOW()
  WHERE  id         = p_product_id
    AND  tenant_id  = p_tenant_id
    AND  stock      >= p_quantity;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;
