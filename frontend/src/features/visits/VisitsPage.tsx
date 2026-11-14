import React from 'react';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../stores/authStore';
import { AdminVisits } from './AdminVisits';
import { ParentVisits } from './ParentVisits';

/** Visites (/app/visites) : le parent fait et suit ses demandes ; la direction les traite. */
export const VisitsPage: React.FC = () => {
  const role = useAuth(s => s.user!.role);
  const isParent = role === 'PARENT';
  return (
    <div>
      <PageHeader
        title="Visites"
        description={isParent ? "Demandez à rendre visite à votre enfant et suivez la réponse de la direction." : 'Traitement des demandes de visite des familles.'}
      />
      {isParent ? <ParentVisits /> : <AdminVisits />}
    </div>
  );
};

export default VisitsPage;
