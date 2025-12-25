// CRM Types

export interface CRMType {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  available: boolean;
}

export const CRM_TYPES: CRMType[] = [
  {
    id: 'tulip',
    name: 'Tulip',
    description: 'Maternity & Wellness Lead Management',
    icon: 'LocalFlorist',
    color: '#E91E63',
    available: true,
  },
  {
    id: 'health_compass',
    name: 'Health Compass',
    description: 'Health Screening Lead Management',
    icon: 'Explore',
    color: '#2196F3',
    available: false,
  },
];

export const getCRMById = (id: string): CRMType | undefined => {
  return CRM_TYPES.find((crm) => crm.id === id);
};

export const getAvailableCRMs = (): CRMType[] => {
  return CRM_TYPES.filter((crm) => crm.available);
};
