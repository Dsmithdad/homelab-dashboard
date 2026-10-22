import React from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardMedia,
  Alert
} from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';

const NotFound = () => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <Card sx={{ maxWidth: 400, textAlign: 'center' }}>
        <CardMedia
          component="svg"
          viewBox="0 0 24 24"
          aria-labelledby="error-title"
          title="error"
          sx={{ margin: 'auto', width: 120, height: 120, mb: 4 }}
        >
          <ErrorOutline fontSize="inherit" />
        </CardMedia>
        <CardContent>
          <Typography variant="h4" gutterBottom>
            404
          </Typography>
          <Typography variant="h5" gutterBottom>
            Page Not Found
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            The page you are looking for does not exist or has been moved.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="large"
            href="/"
          >
            Return to Home
          </Button>
        </CardContent>
      </Card>

      <Box sx={{ mt: 4 }}>
        <Alert severity="info">
          If you believe this is an error, please check the URL or contact the system administrator.
        </Alert>
      </Box>
    </Box>
  );
};

export default NotFound;