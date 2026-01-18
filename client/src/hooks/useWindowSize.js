import { useState, useEffect, useLayoutEffect } from 'react';

const useWindowSize = () => {
  // Initialize state with the initial window size
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const handleResize = () => {
    // Update the state with new window dimensions
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  useLayoutEffect(() => {
    // Add event listener when the component mounts
    window.addEventListener('resize', handleResize);

    // Call handleResize once initially to set the state
    handleResize();

    // Clean up the event listener when the component unmounts
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Empty dependency array ensures the effect runs only on mount and unmount

  return windowSize;
};

export default useWindowSize;
