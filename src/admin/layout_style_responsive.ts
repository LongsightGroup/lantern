export const ADMIN_LAYOUT_STYLE_RESPONSIVE = `
      @media (max-width: 860px) {
        .two-column {
          grid-template-columns: 1fr;
        }

        .form-grid {
          grid-template-columns: 1fr;
        }

        .version-row-layout {
          grid-template-columns: 1fr;
        }

        .panel-header,
        .page-header-bar {
          flex-direction: column;
        }

        .operator-chip {
          justify-items: start;
          min-width: 0;
          border-radius: var(--radius);
          text-align: left;
        }

        .deployment-tab-strip {
          flex-direction: column;
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
