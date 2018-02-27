import baseGame from './baseGame';
import dlc1 from './dlc1';
import allItems from './allItems';
import newemblems from './newemblems';

export default [
  {
    path: '/',
    setData: baseGame
  },
  {
    path: '/curse-of-osiris',
    setData: dlc1
  },
  {
    path: '/all-items',
    setData: allItems
  },
  {
    path: '/newemblems',
    setData: newemblems
  }
];
