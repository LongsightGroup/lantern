export const ADMIN_LAYOUT_STYLE_RESPONSIVE = `
      @media (max-width: 860px) {
        .two-column {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 768px) {
        .sidebar {
          display: none;
        }

        .main {
          margin-left: 0;
        }

        .page-header,
        .page-body {
          padding-left: 20px;
          padding-right: 20px;
        }
      }
`;
