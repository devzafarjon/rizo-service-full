type ArticleRow = {
  id: string;
  productCategory: string | null;
  productId: string | null;
  titleUz: string;
  titleRu: string;
  titleEn: string;
  bodyUz: string;
  bodyRu: string;
  bodyEn: string;
  videoUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export function serializeArticle(row: ArticleRow) {
  return {
    id: row.id,
    productCategory: row.productCategory,
    productId: row.productId,
    title: { uz: row.titleUz, ru: row.titleRu, en: row.titleEn },
    body: { uz: row.bodyUz, ru: row.bodyRu, en: row.bodyEn },
    videoUrl: row.videoUrl,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
  };
}
