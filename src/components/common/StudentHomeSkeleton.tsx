const Line = ({ width = "100%" }: { width?: string }) => (
  <span className="skeleton-line s-home-skeleton-line" style={{ width }} />
);

export default function StudentHomeSkeleton() {
  return (
    <div className="s-home-skeleton" aria-busy="true" aria-label="Loading homepage">
      <span className="sr-only" role="status">Loading homepage...</span>
      <div aria-hidden="true">
        <div className="s-profile-header-card">
          <span className="s-profile-avatar-large s-home-skeleton-block" />
          <div className="s-profile-header-info">
            <div className="s-profile-name-row">
              <h1><Line width="245px" /></h1>
            </div>
            <div className="s-profile-badges">
              {[70, 48, 50].map((width) => (
                <span className="s-badge" key={width}><Line width={`${width}px`} /></span>
              ))}
            </div>
            <p className="s-profile-track"><Line width="300px" /></p>
            <p className="s-profile-grade"><Line width="180px" /></p>
            <p className="s-profile-grade"><Line width="150px" /></p>
          </div>
        </div>

        <div className="s-dashboard-grid s-home-overview-grid">
          <section className="s-home-credentials">
            <div className="s-credential-header">
              <div className="s-icon-ac">
                <div className="s-co"><span className="s-home-skeleton-block s-home-skeleton-document" /></div>
                <h2 className="s-section-title"><Line width="150px" /></h2>
              </div>
              <div className="s-credential-header-actions">
                <div className="s-submit-docs-btn"><Line width="120px" /></div>
                <div className="s-submit-docs-btn"><Line width="150px" /></div>
              </div>
            </div>
            <div className="s-activity-list">
              {Array.from({ length: 5 }, (_, index) => (
                <div className="s-activity-item" key={index}>
                  <span className="s-activity-icon s-home-skeleton-block" />
                  <div className="s-activity-details">
                    <div className="s-activity-title"><Line width={index % 2 ? "260px" : "120px"} /></div>
                    <div className="s-uploaded-file-info">
                      <span className="s-file-name"><Line width="145px" /></span>
                    </div>
                  </div>
                  <div className="s-activity-actions">
                    <span className="s-activity-action-btn s-home-skeleton-block" />
                  </div>
                  <span className="s-activity-status"><Line width="80px" /></span>
                </div>
              ))}
            </div>
          </section>

          <div className="s-card s-home-balance">
            <div className="s-card-header1"><h3><Line width="180px" /></h3></div>
            <div className="s-balance-content">
              <div className="s-balance-amount"><Line width="90px" /></div>
              <p><Line /></p>
              <p><Line width="65%" /></p>
              <p><Line width="75%" /></p>
              <p><Line width="85%" /></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
